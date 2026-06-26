import { randomUUID } from "crypto";
import type { FastifyRequest, FastifyReply } from "fastify";
import * as Sentry from "@sentry/bun";
import { ZodError } from "zod";
import DodoPayments from "dodopayments";
import { onboardingSchema } from "../../../zod/internals.ts";
import {
  createWideEventBuilder,
  generateRequestId,
} from "../../../context/requestContext.ts";
import { logger } from "../../../errors/logger.ts";
import { AuthError } from "../../../errors/auth";
import { StorageError } from "../../../errors/storage";
import { authenticateMasterApiKey } from "../../../utils/authenticateMasterApiKey.ts";
import { authenticateHttpApiKey } from "../../../utils/authenticateHttpApiKey.ts";
import { generateAPIKey } from "../../../utils/generateAPIKey";
import { hashAPIKey } from "../../../utils/hashAPIKey";
import { encrypt, decrypt } from "../../../utils/encryptMetadata.ts";
import { getPostgresDB } from "../../../storage/db/postgres/db";
import {
  projectsTable,
  apiKeysTable,
  metadataTable,
} from "../../../storage/db/postgres/schema";
import { getMetadata } from "../../../storage/db/postgres/helpers/metadata";
import { removeClient } from "../../gRPC/payment/paymentProvider.ts";
import { DateTime } from "luxon";
import { eq } from "drizzle-orm";
import { executeInTransaction } from "../../../storage/adapter/postgres/handlers/addEventUtils";

export async function handleOnboarding(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<Record<string, unknown>> {
  const builder = createWideEventBuilder(
    generateRequestId(),
    request.method,
    request.url
  );

  try {
    const authHeader = request.headers.authorization;
    authenticateMasterApiKey(authHeader);

    const body = await request.body;
    const validated = onboardingSchema.parse(body);

    const appUrl = process.env.APP_URL;
    if (!appUrl) {
      builder.setError(500, {
        type: "ConfigError",
        message: "APP_URL environment variable is not set",
      });
      reply.code(500);
      return {};
    }

    const projectId = randomUUID();

    const existing = await getPostgresDB()
      .select({ id: projectsTable.id })
      .from(projectsTable)
      .where(eq(projectsTable.name, validated.name))
      .limit(1);

    if (existing.length > 0) {
      builder.setError(409, {
        type: "ConflictError",
        message: `Project with name '${validated.name}' already exists`,
      });
      reply.code(409);
      return {};
    }

    const liveClient = new DodoPayments({
      bearerToken: validated.dodoLiveApiKey,
      environment: "live_mode",
    });
    const testClient = new DodoPayments({
      bearerToken: validated.dodoTestApiKey,
      environment: "test_mode",
    });

    let liveSecret: string;
    let testSecret: string;
    let liveWebhookId: string | undefined;
    let testWebhookId: string | undefined;
    try {
      const liveWebhook = await liveClient.webhooks.create({
        url: `${appUrl}/webhooks/payment/createdCheckout?mode=production&projectId=${projectId}`,
        description: "Scrawn live payment webhook",
        filter_types: ["payment.succeeded", "payment.failed"],
      });
      liveWebhookId = liveWebhook.id;
      liveSecret = (await liveClient.webhooks.retrieveSecret(liveWebhook.id))
        .secret;

      const testWebhook = await testClient.webhooks.create({
        url: `${appUrl}/webhooks/payment/createdCheckout?mode=test&projectId=${projectId}`,
        description: "Scrawn test payment webhook",
        filter_types: ["payment.succeeded", "payment.failed"],
      });
      testWebhookId = testWebhook.id;
      testSecret = (await testClient.webhooks.retrieveSecret(testWebhook.id))
        .secret;
    } catch (error) {
      if (liveWebhookId) {
        liveClient.webhooks.delete(liveWebhookId).catch((e) =>
          Sentry.captureException(e, {
            extra: { context: "rollback: failed to delete live webhook" },
          })
        );
      }
      if (testWebhookId) {
        testClient.webhooks.delete(testWebhookId).catch((e) =>
          Sentry.captureException(e, {
            extra: { context: "rollback: failed to delete test webhook" },
          })
        );
      }
      const errMsg = error instanceof Error ? error.message : String(error);
      Sentry.captureException(error, {
        extra: { context: "dodo webhook registration during onboarding" },
      });
      builder.setError(400, {
        type: "DodoApiError",
        message: `Failed to register webhook with Dodo: ${errMsg}`,
      });
      reply.code(400);
      return {};
    }

    const dashboardKey = generateAPIKey("dashboard");
    const dashboardKeyHash = hashAPIKey(dashboardKey);
    const expiresAt = DateTime.utc().plus({ years: 10 }).toISO();

    const db = getPostgresDB();
    try {
      await executeInTransaction(db, "create project", async (txn) => {
        await txn.insert(projectsTable).values({
          id: projectId,
          name: validated.name,
        });

        await txn.insert(metadataTable).values({
          projectId,
          dodo_live_api_key: encrypt(validated.dodoLiveApiKey),
          dodo_test_api_key: encrypt(validated.dodoTestApiKey),
          dodo_live_product_id: validated.dodoLiveProductId,
          dodo_test_product_id: validated.dodoTestProductId,
          dodo_live_webhook_secret: encrypt(liveSecret),
          dodo_test_webhook_secret: encrypt(testSecret),
          currency: validated.currency,
          redirect_url: validated.redirectUrl,
        });

        await txn.insert(apiKeysTable).values({
          projectId,
          name: "Default dashboard key",
          key: dashboardKeyHash,
          role: "dashboard",
          expiresAt,
        });
      });
    } catch (txnError) {
      if (liveWebhookId) {
        liveClient.webhooks.delete(liveWebhookId).catch((e) =>
          Sentry.captureException(e, {
            extra: {
              context:
                "rollback: failed to delete live webhook after DB failure",
            },
          })
        );
      }
      if (testWebhookId) {
        testClient.webhooks.delete(testWebhookId).catch((e) =>
          Sentry.captureException(e, {
            extra: {
              context:
                "rollback: failed to delete test webhook after DB failure",
            },
          })
        );
      }
      throw txnError;
    }

    removeClient(projectId);

    builder.setSuccess(201);

    reply.code(201);
    return { projectId, apiKey: dashboardKey };
  } catch (error) {
    Sentry.captureException(error, {
      extra: { context: "onboarding route handler" },
    });

    if (
      error instanceof StorageError &&
      error.type === "CONSTRAINT_VIOLATION"
    ) {
      builder.setError(409, {
        type: "ConflictError",
        message: "A project with this name already exists",
      });
      reply.code(409);
      return {};
    }

    if (error instanceof AuthError) {
      builder.setError(401, {
        type: error.type,
        message: error.message,
      });
      reply.code(401);
      return {};
    }

    if (error instanceof ZodError) {
      const issues = error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ");
      builder.setError(400, {
        type: "ValidationError",
        message: issues,
      });
      reply.code(400);
      return {};
    }

    const err = error instanceof Error ? error : new Error(String(error));
    builder.setError(500, {
      type: "InternalError",
      message: err.message,
    });
    reply.code(500);
    return {};
  } finally {
    logger.emit(builder.build());
  }
}

function maskApiKey(key: string | null | undefined): string | null {
  if (!key) return null;
  if (key.length <= 16) return "****";
  return key.slice(0, 4) + "****" + key.slice(-4);
}

export async function handleGetConfig(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<Record<string, unknown>> {
  const builder = createWideEventBuilder(
    generateRequestId(),
    request.method,
    request.url
  );

  try {
    const authHeader = request.headers.authorization;

    let projectId: string | undefined;
    let isMasterKey = false;
    try {
      authenticateMasterApiKey(authHeader);
      isMasterKey = true;
    } catch (masterErr) {
      if (!(masterErr instanceof AuthError)) {
        throw masterErr;
      }

      const auth = await authenticateHttpApiKey(authHeader);
      if (auth.role !== "dashboard") {
        throw AuthError.permissionDenied("Only dashboard keys can read config");
      }
      projectId = auth.projectId;
    }

    if (isMasterKey) {
      const query = request.query as Record<string, string>;
      if (!query.projectId) {
        throw AuthError.permissionDenied(
          "projectId is required when using master key"
        );
      }
      projectId = query.projectId;
    }

    const metadata = await getMetadata(projectId!);

    if (!metadata) {
      builder.setSuccess(200);
      reply.code(200);
      return { configured: false };
    }

    builder.setSuccess(200);
    reply.code(200);
    return {
      configured: true,
      dodo_live_api_key: maskApiKey(decrypt(metadata.dodo_live_api_key)),
      dodo_test_api_key: maskApiKey(decrypt(metadata.dodo_test_api_key)),
      dodo_live_product_id: metadata.dodo_live_product_id,
      dodo_test_product_id: metadata.dodo_test_product_id,
      dodo_live_webhook_secret: maskApiKey(
        decrypt(metadata.dodo_live_webhook_secret)
      ),
      dodo_test_webhook_secret: maskApiKey(
        decrypt(metadata.dodo_test_webhook_secret)
      ),
      currency: metadata.currency,
      redirect_url: metadata.redirect_url,
    };
  } catch (error) {
    Sentry.captureException(error, {
      extra: { context: "get config handler" },
    });

    if (error instanceof AuthError) {
      builder.setError(401, {
        type: error.type,
        message: error.message,
      });
      reply.code(401);
      return { error: error.message };
    }

    builder.setError(500, {
      type: "InternalError",
      message: "Failed to read config",
    });
    reply.code(500);
    return { error: "Internal server error" };
  } finally {
    logger.emit(builder.build());
  }
}
