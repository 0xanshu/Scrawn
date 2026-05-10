import { eq } from "drizzle-orm";
import { AuthError } from "../errors/auth";
import { apiKeyCache } from "./apiKeyCache";
import { getPostgresDB } from "../storage/db/postgres/db";
import { apiKeysTable } from "../storage/db/postgres/schema";
import { hashAPIKey } from "./hashAPIKey";
import { DateTime } from "luxon";

export async function authenticateHttpApiKey(
  authHeader: string | undefined
): Promise<string> {
  if (!authHeader) {
    throw AuthError.missingHeader();
  }

  if (!authHeader.startsWith("Bearer ")) {
    throw AuthError.invalidHeaderFormat();
  }

  const apiKey = authHeader.slice("Bearer ".length).trim();

  if (!apiKey.startsWith("scrn_") || apiKey.length !== 37) {
    throw AuthError.invalidAPIKey("Invalid API key format");
  }

  const apiKeyHash = hashAPIKey(apiKey);

  const cached = apiKeyCache.get(apiKeyHash);
  if (cached) {
    return cached.id;
  }

  const db = getPostgresDB();
  const [apiKeyRecord] = await db
    .select({
      id: apiKeysTable.id,
      expiresAt: apiKeysTable.expiresAt,
      revoked: apiKeysTable.revoked,
    })
    .from(apiKeysTable)
    .where(eq(apiKeysTable.key, apiKeyHash))
    .limit(1);

  if (!apiKeyRecord) {
    throw AuthError.invalidAPIKey("API key not found");
  }

  if (apiKeyRecord.revoked) {
    throw AuthError.revokedAPIKey();
  }

  if (DateTime.utc() > DateTime.fromISO(apiKeyRecord.expiresAt)) {
    throw AuthError.expiredAPIKey();
  }

  apiKeyCache.set(apiKeyHash, {
    id: apiKeyRecord.id,
    expiresAt: apiKeyRecord.expiresAt,
  });

  return apiKeyRecord.id;
}
