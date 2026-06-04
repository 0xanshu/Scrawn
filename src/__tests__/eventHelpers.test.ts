import { describe, it, expect } from "vitest";
import { DateTime } from "luxon";
import { createEventInstance } from "../utils/eventHelpers";
import type { BasicUsage } from "../events/BasicUsage";
import type { AITokenUsage } from "../events/AITokenUsage";

describe("createEventInstance", () => {
  it("creates a BasicUsage event", () => {
    const result = createEventInstance({
      type: "BASIC_USAGE",
      userId: "user-1",
      reportedTimestamp: DateTime.utc(),
      eventId: "550e8400-e29b-41d4-a716-446655440000",
      idempotencyKey: "idem-1",
      basicUsage: {
        basicUsageType: "RAW",
        debitAmount: 100,
      },
    });
    expect(result.type).toBe("BASIC_USAGE");
    expect(result.userId).toBe("user-1");
    expect((result as BasicUsage).data.debitAmount).toBe(100);
  });

  it("creates an AITokenUsage event", () => {
    const result = createEventInstance({
      type: "AI_TOKEN_USAGE",
      userId: "user-2",
      reportedTimestamp: DateTime.utc(),
      eventId: "550e8400-e29b-41d4-a716-446655440001",
      idempotencyKey: "idem-2",
      aiTokenUsage: {
        model: "gpt-4",
        provider: "openai",
        inputTokens: 100,
        inputCacheTokens: 0,
        outputTokens: 50,
        outputCacheTokens: 0,
        inputDebitAmount: 10,
        inputCacheDebitAmount: 0,
        outputCacheDebitAmount: 0,
        outputDebitAmount: 20,
      },
    });
    expect(result.type).toBe("AI_TOKEN_USAGE");
    expect(result.userId).toBe("user-2");
    expect((result as AITokenUsage).data.model).toBe("gpt-4");
  });

  it("throws for unsupported event type", () => {
    expect(() =>
      createEventInstance({
        type: "UNSUPPORTED",
        userId: "user-3",
        reportedTimestamp: DateTime.utc(),
        eventId: "550e8400-e29b-41d4-a716-446655440002",
        idempotencyKey: "idem-3",
      } as never)
    ).toThrow("Unsupported event type");
  });

  it("sets ingested_timestamp on construction", () => {
    const result = createEventInstance({
      type: "BASIC_USAGE",
      userId: "u",
      reportedTimestamp: DateTime.utc(),
      eventId: "550e8400-e29b-41d4-a716-446655440003",
      idempotencyKey: "idem-3",
      basicUsage: { basicUsageType: "RAW", debitAmount: 1 },
    });
    expect(result.ingested_timestamp).toBeDefined();
    expect(DateTime.isDateTime(result.ingested_timestamp)).toBe(true);
  });

  it("includes metadata in serialized output", () => {
    const result = createEventInstance({
      type: "BASIC_USAGE",
      userId: "u",
      reportedTimestamp: DateTime.utc(),
      eventId: "550e8400-e29b-41d4-a716-446655440004",
      idempotencyKey: "idem-4",
      basicUsage: {
        basicUsageType: "RAW",
        debitAmount: 100,
        metadata: { env: "test", count: 5 },
      },
    });
    const s = result.serialize();
    expect(s.SQL.data.metadata).toEqual({ env: "test", count: 5 });
  });
});
