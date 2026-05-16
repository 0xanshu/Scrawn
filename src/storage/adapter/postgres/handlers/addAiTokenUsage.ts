import { getPostgresDB } from "../../../db/postgres/db";
import {
  aiTokenUsageEventsTable,
} from "../../../db/postgres/schema";
import { StorageError } from "../../../../errors/storage";
import { type SqlRecordOf } from "../../../../interface/event/Event";
import type { UserId } from "../../../../config/identifiers";
import { DateTime } from "luxon";
import { ensureUserExists } from "../../../db/postgres/helpers/users";
import {
  validateAndPrepareTimestamp,
  executeInTransaction,
} from "./addEventUtils";
import { metricsSchema } from "../../../../zod/metrics";
import type { Metrics } from "../../../../zod/metrics";

type AggregatedEvent = {
  userId: UserId;
  model: string;
  provider: string;
  inputTokens: number;
  inputCacheTokens: number;
  outputTokens: number;
  inputDebitAmount: number;
  inputCacheDebitAmount: number;
  outputDebitAmount: number;
  reported_timestamp: string;
  metadata?: Record<string, unknown>;
};

export async function handleAddAiTokenUsage(
  events: Array<SqlRecordOf<"AI_TOKEN_USAGE">>,
  apiKeyId: string,
  mode: "production" | "test"
): Promise<{ id: string } | void> {
  const connectionObject = getPostgresDB();

  if (events.length === 0) {
    return;
  }

  for (const event_data of events) {
    const inputTokens = event_data.data.inputTokens;
    if (typeof inputTokens === "number" && inputTokens < 0) {
      throw StorageError.insertFailed(
        `Negative input tokens not allowed for AI token usage for user ${event_data.userId}`,
        new Error(`inputTokens ${inputTokens} is negative`)
      );
    }

    const outputTokens = event_data.data.outputTokens;
    if (typeof outputTokens === "number" && outputTokens < 0) {
      throw StorageError.insertFailed(
        `Negative output tokens not allowed for AI token usage for user ${event_data.userId}`,
        new Error(`outputTokens ${outputTokens} is negative`)
      );
    }

    const inputDebitAmount = event_data.data.inputDebitAmount;
    if (typeof inputDebitAmount === "number" && inputDebitAmount < 0) {
      throw StorageError.insertFailed(
        `Negative input debit amount not allowed for AI token usage for user ${event_data.userId}`,
        new Error(`inputDebitAmount ${inputDebitAmount} is negative`)
      );
    }

    const outputDebitAmount = event_data.data.outputDebitAmount;
    if (typeof outputDebitAmount === "number" && outputDebitAmount < 0) {
      throw StorageError.insertFailed(
        `Negative output debit amount not allowed for AI token usage for user ${event_data.userId}`,
        new Error(`outputDebitAmount ${outputDebitAmount} is negative`)
      );
    }

    const inputCacheTokens = event_data.data.inputCacheTokens;
    if (typeof inputCacheTokens === "number" && inputCacheTokens < 0) {
      throw StorageError.insertFailed(
        `Negative input cache tokens not allowed for AI token usage for user ${event_data.userId}`,
        new Error(`inputCacheTokens ${inputCacheTokens} is negative`)
      );
    }

    const inputCacheDebitAmount = event_data.data.inputCacheDebitAmount;
    if (typeof inputCacheDebitAmount === "number" && inputCacheDebitAmount < 0) {
      throw StorageError.insertFailed(
        `Negative input cache debit amount not allowed for AI token usage for user ${event_data.userId}`,
        new Error(`inputCacheDebitAmount ${inputCacheDebitAmount} is negative`)
      );
    }
  }

  const aggregationMap = new Map<string, AggregatedEvent>();

  for (const event_data of events) {
    const reported_timestamp = await validateAndPrepareTimestamp(
      event_data.reported_timestamp
    );

    const key = `${event_data.userId}:${event_data.data.model}`;
    const existing = aggregationMap.get(key);

    if (existing) {
      existing.inputTokens += event_data.data.inputTokens;
      existing.inputCacheTokens += event_data.data.inputCacheTokens;
      existing.outputTokens += event_data.data.outputTokens;
      existing.inputDebitAmount += event_data.data.inputDebitAmount;
      existing.inputCacheDebitAmount += event_data.data.inputCacheDebitAmount;
      existing.outputDebitAmount += event_data.data.outputDebitAmount;
      if (reported_timestamp > existing.reported_timestamp) {
        existing.reported_timestamp = reported_timestamp;
      }
    } else {
      aggregationMap.set(key, {
        userId: event_data.userId,
        model: event_data.data.model,
        provider: event_data.data.provider,
        inputTokens: event_data.data.inputTokens,
        inputCacheTokens: event_data.data.inputCacheTokens,
        outputTokens: event_data.data.outputTokens,
        inputDebitAmount: event_data.data.inputDebitAmount,
        inputCacheDebitAmount: event_data.data.inputCacheDebitAmount,
        outputDebitAmount: event_data.data.outputDebitAmount,
        reported_timestamp,
        metadata: event_data.data.metadata,
      });
    }
  }

  const aggregatedEvents = Array.from(aggregationMap.values());

  return await executeInTransaction(
    connectionObject,
    `storing ${events.length} AI_TOKEN_USAGE event(s)`,
    async (txn) => {
      const uniqueUserIds = Array.from(
        new Set(aggregatedEvents.map((event) => event.userId))
      );

      for (const userId of uniqueUserIds) {
        await ensureUserExists(userId);
      }

      try {
        const aiTokenUsageValues = aggregatedEvents.map((aggEvent) => ({
          reportedTimestamp: aggEvent.reported_timestamp,
          ingestedTimestamp: DateTime.utc().toString(),
          userId: aggEvent.userId,
          apiKeyId: apiKeyId,
          mode: mode,
          model: aggEvent.model,
          provider: aggEvent.provider,
          metrics: metricsSchema.parse({
            tokens: {
              input: aggEvent.inputTokens,
              input_cache: aggEvent.inputCacheTokens,
              output: aggEvent.outputTokens,
            },
            debit_amount: {
              input: aggEvent.inputDebitAmount,
              input_cache: aggEvent.inputCacheDebitAmount,
              output: aggEvent.outputDebitAmount,
            },
          } satisfies Metrics),
          metadata: aggEvent.metadata ?? null,
        }));

        const inserted = await txn
          .insert(aiTokenUsageEventsTable)
          .values(aiTokenUsageValues)
          .returning({ id: aiTokenUsageEventsTable.id });

        if (!inserted[0] || !inserted[0].id) {
          throw StorageError.insertFailed(
            "Missing or invalid ID for the first inserted event",
            new Error(`Invalid first event ID: ${JSON.stringify(inserted[0])}`)
          );
        }

        return { id: inserted[0].id };
      } catch (e) {
        if (
          e &&
          typeof e === "object" &&
          "name" in e &&
          (e as Error).name === "ZodError"
        ) {
          throw StorageError.insertFailed(
            "Invalid metrics for AI token usage event",
            e instanceof Error ? e : new Error(String(e))
          );
        }
        throw StorageError.insertFailed(
          "Failed to batch insert AI token usage events",
          e instanceof Error ? e : new Error(String(e))
        );
      }
    }
  );
}
