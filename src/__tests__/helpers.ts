import * as grpc from "@grpc/grpc-js";
import type {
  EventServiceClient,
  RegisterEventRequest,
  RegisterEventResponse,
} from "../gen/event/v1/event";
import { getPostgresDB } from "../storage/db/postgres/db";
import { apiKeysTable } from "../storage/db/postgres/schema";
import { hashAPIKey } from "../utils/hashAPIKey";
import { DateTime } from "luxon";

export const GRPC_ADDRESS = "localhost:18069";

export function grpcCredentials(): grpc.ChannelCredentials {
  return grpc.credentials.createInsecure();
}

export function grpcMetadata(authHeader: string): grpc.Metadata {
  const metadata = new grpc.Metadata();
  metadata.set("authorization", authHeader);
  return metadata;
}

export function registerEvent(
  client: EventServiceClient,
  request: RegisterEventRequest,
  metadata: grpc.Metadata
): Promise<RegisterEventResponse> {
  return new Promise((resolve, reject) => {
    client.registerEvent(request, metadata, (error, res) => {
      if (error) reject(error);
      else if (!res) reject(new Error("empty response"));
      else resolve(res);
    });
  });
}

export async function createTestApiKey(): Promise<{
  rawKey: string;
}> {
  const db = getPostgresDB();
  const rawKey = `scrn_test_${crypto.randomUUID().replace(/-/g, "").slice(0, 32)}`;
  await db.insert(apiKeysTable).values({
    name: `test-key-${crypto.randomUUID()}`,
    key: hashAPIKey(rawKey),
    role: "test",
    expiresAt: DateTime.utc().plus({ years: 1 }).toISO(),
  });
  return { rawKey };
}
