import type { FastifyRequest, FastifyReply } from "fastify";
import * as Sentry from "@sentry/bun";
import { ZodError } from "zod";
import { onboardingCronSchema } from "../../../zod/internals.ts";
import { reloadScheduler } from "../../../schedulers/onboarding.ts";
import {
  createWideEventBuilder,
  generateRequestId,
} from "../../../context/requestContext.ts";
import { logger } from "../../../errors/logger.ts";
import { upsertMetadata } from "../../../storage/db/postgres/helpers/metadata.ts";

export async function handleOnboarding(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<{ crons: string[] }> {
  const builder = createWideEventBuilder(
    generateRequestId(),
    request.method,
    request.url
  );

  try {
    const body = await request.body;
    const validated = onboardingCronSchema.parse(body);

    const webhookUrl =
      validated.webhookUrl && validated.webhookUrl !== ""
        ? validated.webhookUrl
        : null;

    await upsertMetadata({
      payment_cron: validated.crons,
      payment_webhook: webhookUrl,
    });

    await reloadScheduler();

    builder.setSuccess(200).addContext({
      cronCount: validated.crons.length,
    });

    reply.code(201);
    return { crons: validated.crons };
  } catch (error) {
    Sentry.captureException(error, {
      extra: { context: "onboarding route handler" },
    });

    if (error instanceof ZodError) {
      const issues = error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ");
      builder.setError(400, {
        type: "ValidationError",
        message: issues,
      });
      reply.code(400);
      return { crons: [] };
    }

    const err = error instanceof Error ? error : new Error(String(error));
    builder.setError(500, {
      type: "InternalError",
      message: err.message,
    });
    reply.code(500);
    return { crons: [] };
  } finally {
    logger.emit(builder.build());
  }
}
