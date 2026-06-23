import { createHmac, randomUUID } from "crypto";
import { generateAPIKey } from "./generateAPIKey";
import { DateTime } from "luxon";
import { getPostgresDB } from "../storage/db/postgres/db";
import { projectsTable, apiKeysTable } from "../storage/db/postgres/schema";

const HMAC_SECRET = process.env.HMAC_SECRET;

if (!HMAC_SECRET) {
  throw new Error(
    "HMAC_SECRET environment variable is not set. (check .env.example file)"
  );
}

const SECRET: string = HMAC_SECRET;

function hashAPIKey(apiKey: string): string {
  return createHmac("sha256", SECRET).update(apiKey).digest("hex");
}

export type InitialApiKeyData = {
  projectId: string;
  apiKeyId: string;
  apiKey: string;
  apiKeyHash: string;
  name: string;
  role: "dashboard" | "production" | "test";
  createdAt: string;
  expiresAt: string;
  authorizationHeader: string;
};

export function generateInitialApiKeyData(): InitialApiKeyData {
  const projectId = randomUUID();
  const apiKeyId = randomUUID();
  const apiKey = generateAPIKey("dashboard");
  const apiKeyHash = hashAPIKey(apiKey);
  const name = "Dashboard Key";
  const role = "dashboard";
  const createdAt = DateTime.utc().toISO();
  const expiresAt = DateTime.utc().plus({ days: 365 }).toISO();

  return {
    projectId,
    apiKeyId,
    apiKey,
    apiKeyHash,
    name,
    role,
    createdAt,
    expiresAt,
    authorizationHeader: `Authorization: Bearer ${apiKey}`,
  };
}

async function insertInitialData(data: InitialApiKeyData) {
  const db = getPostgresDB(process.env.DATABASE_URL);

  await db.insert(projectsTable).values({
    id: data.projectId,
    name: "Default Project",
    createdAt: data.createdAt,
  });

  await db.insert(apiKeysTable).values({
    id: data.apiKeyId,
    projectId: data.projectId,
    name: data.name,
    key: data.apiKeyHash,
    role: data.role,
    createdAt: data.createdAt,
    expiresAt: data.expiresAt,
    revoked: false,
    revokedAt: null,
  });
}

const data = generateInitialApiKeyData();

await insertInitialData(data);

console.log("Initial API key generation was successful..");
console.log(data);
process.exit(0);
