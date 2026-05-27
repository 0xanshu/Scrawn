import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Metadata } from "@grpc/grpc-js";
import {
  EventServiceClient,
  EventType,
  BasicUsageType,
} from "../gen/event/v1/event";
import {
  grpcCredentials,
  grpcMetadata,
  createTestApiKey,
  registerEvent,
  GRPC_ADDRESS,
} from "./helpers";
import { DateTime } from "luxon";

function registerEventPayload() {
  return {
    type: EventType.BASIC_USAGE,
    userId: crypto.randomUUID(),
    reportedTimestamp: Math.floor(DateTime.utc().toSeconds()),
    eventId: crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
    basicUsage: { basicUsageType: BasicUsageType.RAW, amount: 100 },
  };
}

describe("EventService", () => {
  let client: EventServiceClient;
  let rawKey: string;

  beforeAll(async () => {
    client = new EventServiceClient(GRPC_ADDRESS, grpcCredentials());
    rawKey = (await createTestApiKey()).rawKey;
  });

  afterAll(() => {
    client.close();
  });

  describe("registerEvent", () => {
    it("stores a basic usage event", async () => {
      const res = await registerEvent(
        client,
        registerEventPayload(),
        grpcMetadata(`Bearer ${rawKey}`)
      );
      expect(res.random).toBe("Event stored successfully");
    });

    it("rejects unauthenticated requests", async () => {
      await expect(
        registerEvent(client, registerEventPayload(), new Metadata())
      ).rejects.toThrow();
    });

    it("rejects requests with an invalid API key", async () => {
      await expect(
        registerEvent(
          client,
          registerEventPayload(),
          grpcMetadata("Bearer bad_key")
        )
      ).rejects.toThrow();
    });
  });
});
