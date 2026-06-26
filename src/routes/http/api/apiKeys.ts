import type { FastifyRequest, FastifyReply } from "fastify";
import * as Sentry from "@sentry/bun";
import { ZodError } from "zod";
import { z } from "zod";
import {
  createWideEventBuilder,
  generateRequestId,
} from "../../../context/requestContext.ts";
import { logger } from "../../../errors/logger.ts";
import { AuthError } from "../../../errors/auth.ts";
import { authenticateHttpApiKey } from "../../../utils/authenticateHttpApiKey.ts";
import { generateAPIKey } from "../../../utils/generateAPIKey";
import { hashAPIKey } from "../../../utils/hashAPIKey";
import { DateTime } from "luxon";
import { createApiKey } from "../../../storage/db/postgres/helpers/apiKeys";
import { upsertWebhookEndpoint } from "../../../storage/db/postgres/helpers/webhookEndpoints";
import { generateWebhookKeyPair } from "../../../utils/generateWebhookKeyPair";
import { getPostgresDB } from "../../../storage/db/postgres/db";
import { executeInTransaction } from "../../../storage/adapter/postgres/handlers/addEventUtils";
import {
  apiKeysTable,
  projectsTable,
  webhookEndpointsTable,
} from "../../../storage/db/postgres/schema";
import { eq, and, isNull, ne, sql } from "drizzle-orm";
import type { ApiKeyRole } from "../../../utils/keyFormat";
import { invalidateWebhookEndpointCache } from "../../../interceptors/auth";
import { apiKeyCache } from "../../../utils/apiKeyCache";
import { authenticateMasterApiKey } from "../../../utils/authenticateMasterApiKey.ts";

const createApiKeySchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  role: z.enum(["test", "production"]),
  expiresIn: z
    .number()
    .int()
    .min(60)
    .max(365 * 24 * 60 * 60),
  webhookUrl: z.string().url("Invalid webhook URL").max(2048),
});

export async function handleCreateApiKey(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<Record<string, unknown> | { error: string }> {
  const builder = createWideEventBuilder(
    generateRequestId(),
    request.method,
    request.url
  );

  try {
    const auth = await authenticateHttpApiKey(request.headers.authorization);
    if (auth.role !== "dashboard") {
      throw AuthError.permissionDenied(
        "Only dashboard keys can manage API keys"
      );
    }
    builder.setApiKeyContext({ name: `create-key:${auth.apiKeyId}` });

    const body = await request.body;
    const validated = createApiKeySchema.parse(body);

    if (
      validated.role === "production" &&
      !validated.webhookUrl.startsWith("https://")
    ) {
      builder.setError(400, {
        type: "ValidationError",
        message: "Production webhook URLs must use HTTPS",
      });
      reply.code(400);
      return { error: "Production webhook URLs must use HTTPS" };
    }

    const apiKey = generateAPIKey(validated.role as ApiKeyRole);
    const apiKeyHash = hashAPIKey(apiKey);
    const now = DateTime.utc();
    const expiresAt = now.plus({ seconds: validated.expiresIn });

    const db = getPostgresDB();
    const { keyRecord, endpoint } = await executeInTransaction(
      db,
      "create API key",
      async (txn) => {
        const rec = await createApiKey(
          {
            name: validated.name,
            key: apiKeyHash,
            role: validated.role,
            expiresAt: expiresAt.toISO(),
            projectId: auth.projectId,
          },
          txn
        );

        const keyPair = generateWebhookKeyPair();
        const ep = await upsertWebhookEndpoint(
          auth.projectId,
          rec.id,
          validated.webhookUrl,
          keyPair.privateKeyPem,
          keyPair.publicKeyPrefixed,
          txn
        );

        return { keyRecord: rec, endpoint: ep };
      }
    );
    invalidateWebhookEndpointCache(keyRecord.id);

    builder.setSuccess(200);
    reply.code(200);
    return {
      id: keyRecord.id,
      name: validated.name,
      key: apiKey,
      role: validated.role,
      expiresAt: expiresAt.toISO(),
      webhookEndpoint: {
        id: endpoint.id,
        url: endpoint.url,
        publicKey: endpoint.publicKey,
      },
    };
  } catch (error) {
    Sentry.captureException(error, {
      extra: { context: "create API key handler" },
    });

    if (error instanceof AuthError) {
      builder.setError(401, { type: error.type, message: error.message });
      reply.code(401);
      return { error: error.message };
    }

    if (error instanceof ZodError) {
      const issues = error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ");
      builder.setError(400, { type: "ValidationError", message: issues });
      reply.code(400);
      return { error: issues };
    }

    const err = error instanceof Error ? error : new Error(String(error));
    builder.setError(500, { type: "InternalError", message: err.message });
    reply.code(500);
    return { error: "Internal server error" };
  } finally {
    logger.emit(builder.build());
  }
}

export async function handleListApiKeys(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<Record<string, unknown> | { error: string }> {
  const builder = createWideEventBuilder(
    generateRequestId(),
    request.method,
    request.url
  );

  try {
    const auth = await authenticateHttpApiKey(request.headers.authorization);
    if (auth.role !== "dashboard") {
      throw AuthError.permissionDenied(
        "Only dashboard keys can manage API keys"
      );
    }

    const db = getPostgresDB();
    const keys = await db
      .select({
        id: apiKeysTable.id,
        name: apiKeysTable.name,
        role: apiKeysTable.role,
        createdAt: apiKeysTable.createdAt,
        expiresAt: apiKeysTable.expiresAt,
        revoked: apiKeysTable.revoked,
        webhookUrl: webhookEndpointsTable.url,
        webhookPublicKey: webhookEndpointsTable.publicKey,
        webhookEndpointId: webhookEndpointsTable.id,
      })
      .from(apiKeysTable)
      .leftJoin(
        webhookEndpointsTable,
        and(
          eq(apiKeysTable.id, webhookEndpointsTable.apiKeyId),
          isNull(webhookEndpointsTable.deletedAt)
        )
      )
      .where(
        and(
          eq(apiKeysTable.projectId, auth.projectId),
          ne(apiKeysTable.role, "dashboard"),
          eq(apiKeysTable.revoked, false)
        )
      )
      .orderBy(apiKeysTable.createdAt);

    builder.setSuccess(200);
    reply.code(200);
    return { keys };
  } catch (error) {
    Sentry.captureException(error, {
      extra: { context: "list API keys handler" },
    });

    if (error instanceof AuthError) {
      builder.setError(401, { type: error.type, message: error.message });
      reply.code(401);
      return { error: error.message };
    }

    const err = error instanceof Error ? error : new Error(String(error));
    builder.setError(500, { type: "InternalError", message: err.message });
    reply.code(500);
    return { error: "Internal server error" };
  } finally {
    logger.emit(builder.build());
  }
}

export async function handleRevokeApiKey(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<Record<string, unknown> | { error: string }> {
  const builder = createWideEventBuilder(
    generateRequestId(),
    request.method,
    request.url
  );

  try {
    const auth = await authenticateHttpApiKey(request.headers.authorization);
    if (auth.role !== "dashboard") {
      throw AuthError.permissionDenied(
        "Only dashboard keys can manage API keys"
      );
    }

    const params = request.params as { id: string };
    const db = getPostgresDB();
    const now = DateTime.utc().toISO();

    const [revokedRow] = await db
      .update(apiKeysTable)
      .set({ revoked: true, revokedAt: now })
      .where(
        and(
          eq(apiKeysTable.projectId, auth.projectId),
          eq(apiKeysTable.id, params.id),
          eq(apiKeysTable.revoked, false),
          ne(apiKeysTable.role, "dashboard")
        )
      )
      .returning({ key: apiKeysTable.key });

    if (!revokedRow) {
      builder.setError(404, {
        type: "NotFoundError",
        message: "API key not found or already revoked",
      });
      reply.code(404);
      return { error: "API key not found or already revoked" };
    }

    apiKeyCache.delete(revokedRow.key);

    builder.setSuccess(200);
    reply.code(200);
    return { message: "API key revoked" };
  } catch (error) {
    Sentry.captureException(error, {
      extra: { context: "revoke API key handler" },
    });

    if (error instanceof AuthError) {
      builder.setError(401, { type: error.type, message: error.message });
      reply.code(401);
      return { error: error.message };
    }

    const err = error instanceof Error ? error : new Error(String(error));
    builder.setError(500, { type: "InternalError", message: err.message });
    reply.code(500);
    return { error: "Internal server error" };
  } finally {
    logger.emit(builder.build());
  }
}

export async function handleCreateDashboardKey(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<Record<string, unknown> | { error: string }> {
  const builder = createWideEventBuilder(
    generateRequestId(),
    request.method,
    request.url
  );

  try {
    const authHeader = request.headers.authorization;
    authenticateMasterApiKey(authHeader);

    const body = await request.body;
    const params = request.params as { projectId: string };

    const appUrl = process.env.APP_URL;
    if (!appUrl) {
      builder.setError(500, {
        type: "ConfigError",
        message: "APP_URL environment variable is not set",
      });
      reply.code(500);
      return { error: "APP_URL environment variable is not set" };
    }

    const projectId = params.project_id;

    const existing = await getPostgresDB()
      .select({ id: projectsTable.id })
      .from(projectsTable)
      .where(eq(projectsTable.id, projectId))
      .limit(1);

    if (existing.length === 0) {
      builder.setError(404, {
        type: "NotFound",
        message: `Project with name '${projectId}' doesn't exist`,
      });
      reply.code(404);
      return {
        error: `Project with name '${projectId}' doesn't exist`,
      };
    }

    const dashboardKey = generateAPIKey("dashboard");
    const dashboardKeyHash = hashAPIKey(dashboardKey);
    const expiresAt = DateTime.utc().plus({ years: 10 }).toISO();
    const db = getPostgresDB();

    await db.insert(apiKeysTable).values({
      projectId,
      name: "Default dashboard key",
      key: dashboardKeyHash,
      role: "dashboard",
      expiresAt,
    });

    builder.setSuccess(201);
    reply.code(201);
    return { projectId, apiKey: dashboardKey };
  } catch (error) {
    if (error instanceof AuthError) {
      builder.setError(401, { type: error.type, message: error.message });
      reply.code(401);
      return { error: error.message };
    }

    if (error instanceof ZodError) {
      const issues = error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ");
      builder.setError(400, { type: "ValidationError", message: issues });
      reply.code(400);
      return { error: issues };
    }

    const err = error instanceof Error ? error : new Error(String(error));
    builder.setError(500, { type: "InternalError", message: err.message });
    reply.code(500);
    return { error: "Internal server error" };
  }
}
