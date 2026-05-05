import { apiKeyContextKey } from "../context/auth";
import {
  wideEventContextKey,
  type WideEventBuilder,
} from "../context/requestContext";
import { AuthError } from "../errors/auth";
import { apiKeyCache } from "../utils/apiKeyCache";
import { getPostgresDB } from "../storage/db/postgres/db";
import { apiKeysTable } from "../storage/db/postgres/schema";
import { eq } from "drizzle-orm";
import { hashAPIKey } from "../utils/hashAPIKey";
import { DateTime } from "luxon";

// Whitelisted endpoints that don't require auth
const no_auth = ["/auth.v1.AuthService/CreateAPIKey", "CreateAPIKey"];

export type GrpcHandler = (call: any, callback: any) => void | Promise<void>;

/**
 * Auth interceptor for gRPC - validates API key from metadata
 */
export function authInterceptor(
  methodPath: string,
  handler: GrpcHandler
): GrpcHandler {
  return async (call: any, callback: any) => {
    // Skip auth for whitelisted endpoints
    if (no_auth.some((path) => methodPath.endsWith(path))) {
      return handler(call, callback);
    }

    const wideEventBuilder = call[
      wideEventContextKey
    ] as WideEventBuilder | null;

    // Extract authorization from metadata
    const authorization = call.metadata?.get("authorization")?.[0];

    if (!authorization) {
      return callback(AuthError.missingHeader());
    }

    if (!authorization.startsWith("Bearer ")) {
      return callback(AuthError.invalidHeaderFormat());
    }

    const apiKey = authorization.slice("Bearer ".length).trim();

    // Validate API key format
    if (!apiKey.startsWith("scrn_") || apiKey.length !== 37) {
      return callback(AuthError.invalidAPIKey("Invalid API key format"));
    }

    const apiKeyHash = hashAPIKey(apiKey);

    // Check cache first
    const cached = apiKeyCache.get(apiKeyHash);
    if (cached) {
      call[apiKeyContextKey] = cached.id;
      wideEventBuilder?.setAuth(cached.id, true);
      return handler(call, callback);
    }

    // Query database for API key
    const apiKeyRecord = await lookupApiKey(apiKeyHash);

    if (!apiKeyRecord) {
      return callback(AuthError.invalidAPIKey("API key not found"));
    }

    if (apiKeyRecord.revoked) {
      return callback(AuthError.revokedAPIKey());
    }

    if (DateTime.utc() > DateTime.fromISO(apiKeyRecord.expiresAt)) {
      return callback(AuthError.expiredAPIKey());
    }

    // Cache and set context
    apiKeyCache.set(apiKeyHash, {
      id: apiKeyRecord.id,
      expiresAt: apiKeyRecord.expiresAt,
    });

    call[apiKeyContextKey] = apiKeyRecord.id;
    wideEventBuilder?.setAuth(apiKeyRecord.id, false);

    return handler(call, callback);
  };
}

async function lookupApiKey(apiKeyHash: string) {
  const db = getPostgresDB();
  const result = await db
    .select({
      id: apiKeysTable.id,
      expiresAt: apiKeysTable.expiresAt,
      revoked: apiKeysTable.revoked,
    })
    .from(apiKeysTable)
    .where(eq(apiKeysTable.key, apiKeyHash))
    .limit(1);

  return result[0];
}
