import { getClickHouseDB } from "../../../db/clickhouse";
import { StorageError } from "../../../../errors/storage";
import { type SqlRecordOf } from "../../../../interface/event/Event";
import type { UserId } from "../../../../config/identifiers";
import { DateTime } from "luxon";
import { toClickHouseDateTime } from "../utils";

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
};

export async function handleAddAiTokenUsage(
  events: Array<SqlRecordOf<"AI_TOKEN_USAGE">>,
  apiKeyId: string,
  mode: "production" | "test"
): Promise<{ id: string } | void> {
  const client = getClickHouseDB();

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
    if (!event_data.reported_timestamp.isValid) {
      throw StorageError.invalidTimestamp(
        "reported_timestamp is not a valid DateTime"
      );
    }
    const reportedTimestamp = toClickHouseDateTime(event_data.reported_timestamp);

    const key = `${event_data.userId}:${event_data.data.model}`;
    const existing = aggregationMap.get(key);

    if (existing) {
      existing.inputTokens += event_data.data.inputTokens;
      existing.inputCacheTokens += event_data.data.inputCacheTokens;
      existing.outputTokens += event_data.data.outputTokens;
      existing.inputDebitAmount += event_data.data.inputDebitAmount;
      existing.inputCacheDebitAmount += event_data.data.inputCacheDebitAmount;
      existing.outputDebitAmount += event_data.data.outputDebitAmount;
      if (reportedTimestamp > existing.reported_timestamp) {
        existing.reported_timestamp = reportedTimestamp;
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
        reported_timestamp: reportedTimestamp,
      });
    }
  }

  const aggregatedEvents = Array.from(aggregationMap.values());
  const firstId = crypto.randomUUID();
  const now = toClickHouseDateTime(DateTime.utc());

  const values = aggregatedEvents.map((aggEvent, index) => {
    const metrics = JSON.stringify({
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
    });

    return {
      id: index === 0 ? firstId : crypto.randomUUID(),
      user_id: aggEvent.userId,
      api_key_id: apiKeyId,
      mode: mode,
      reported_timestamp: aggEvent.reported_timestamp,
      ingested_timestamp: now,
      model: aggEvent.model,
      provider: aggEvent.provider,
      metrics,
    };
  });

  try {
    await client.insert({
      table: "ai_token_usage_events",
      values,
      format: "JSONEachRow",
    });
  } catch (e) {
    throw StorageError.insertFailed(
      "Failed to insert AI token usage events",
      e instanceof Error ? e : new Error(String(e))
    );
  }

  return { id: firstId };
}
