import { getPostgresDB } from "../../storage/db/postgres/db";
import {
  projectsTable,
  apiKeysTable,
  webhookEndpointsTable,
} from "../../storage/db/postgres/schema";
import { eq } from "drizzle-orm";
import { hashAPIKey } from "../../utils/hashAPIKey";
import { DateTime } from "luxon";

export const TEST_PROJECT_ID = "00000000-0000-0000-0000-000000000001";

async function ensureTestProject(): Promise<void> {
  const db = getPostgresDB();
  const [existing] = await db
    .select({ id: projectsTable.id })
    .from(projectsTable)
    .where(eq(projectsTable.id, TEST_PROJECT_ID))
    .limit(1);
  if (existing) return;
  await db.insert(projectsTable).values({
    id: TEST_PROJECT_ID,
    name: "test-project",
  });
}

export async function createTestApiKey(): Promise<{
  rawKey: string;
  id: string;
}> {
  const db = getPostgresDB();
  await ensureTestProject();
  const rawKey = `scrn_test_${crypto.randomUUID().replace(/-/g, "").slice(0, 32)}`;
  const [key] = await db
    .insert(apiKeysTable)
    .values({
      name: `test-key-${crypto.randomUUID()}`,
      key: hashAPIKey(rawKey),
      role: "test",
      expiresAt: DateTime.utc().plus({ years: 1 }).toISO(),
      projectId: TEST_PROJECT_ID,
    })
    .returning({ id: apiKeysTable.id });

  await db.insert(webhookEndpointsTable).values({
    projectId: TEST_PROJECT_ID,
    apiKeyId: key!.id,
    url: "https://example.com/webhook",
    privateKey: "test-private-key",
    publicKey: "test-public-key",
  });

  return { rawKey, id: key!.id };
}

export async function insertKey(
  rawKey: string,
  role: "dashboard" | "test" | "production",
  overrides: Partial<{ revoked: boolean; expiresAt: string }> = {}
): Promise<string> {
  const db = getPostgresDB();
  await ensureTestProject();
  const [key] = await db
    .insert(apiKeysTable)
    .values({
      name: `auth-test-key-${crypto.randomUUID()}`,
      key: hashAPIKey(rawKey),
      role,
      expiresAt:
        overrides.expiresAt ?? DateTime.utc().plus({ years: 1 }).toISO(),
      revoked: overrides.revoked ?? false,
      projectId: TEST_PROJECT_ID,
    })
    .returning({ id: apiKeysTable.id });
  return key!.id;
}
