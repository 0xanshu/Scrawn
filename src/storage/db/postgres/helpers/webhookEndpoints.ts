import { getPostgresDB } from "../db";
import { webhookEndpointsTable } from "../schema";
import { eq } from "drizzle-orm";
import { StorageError } from "../../../../errors/storage";

export type WebhookEndpoint = typeof webhookEndpointsTable.$inferSelect;

export async function getWebhookEndpointByApiKeyId(
  apiKeyId: string
): Promise<WebhookEndpoint | undefined> {
  const db = getPostgresDB();

  try {
    const [endpoint] = await db
      .select()
      .from(webhookEndpointsTable)
      .where(eq(webhookEndpointsTable.apiKeyId, apiKeyId))
      .limit(1);

    return endpoint ?? undefined;
  } catch (e) {
    throw StorageError.queryFailed(
      "Failed to get webhook endpoint by API key ID",
      e instanceof Error ? e : new Error(String(e))
    );
  }
}

export async function upsertWebhookEndpoint(
  apiKeyId: string,
  url: string,
  privateKey: string,
  publicKey: string
): Promise<WebhookEndpoint> {
  const db = getPostgresDB();

  try {
    const existing = await getWebhookEndpointByApiKeyId(apiKeyId);

    if (existing) {
      const [updated] = await db
        .update(webhookEndpointsTable)
        .set({
          url,
          privateKey,
          publicKey,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(webhookEndpointsTable.apiKeyId, apiKeyId))
        .returning();

      if (!updated) {
        throw StorageError.emptyResult(
          "Webhook endpoint update returned no record"
        );
      }

      return updated;
    }

    const [created] = await db
      .insert(webhookEndpointsTable)
      .values({
        apiKeyId,
        url,
        privateKey,
        publicKey,
      })
      .returning();

    if (!created) {
      throw StorageError.emptyResult(
        "Webhook endpoint insert returned no record"
      );
    }

    return created;
  } catch (e) {
    if (e instanceof Error && (e as any).name === "StorageError") {
      throw e;
    }

    throw StorageError.insertFailed(
      "Failed to upsert webhook endpoint",
      e instanceof Error ? e : new Error(String(e))
    );
  }
}

export async function deleteWebhookEndpoint(
  apiKeyId: string
): Promise<boolean> {
  const db = getPostgresDB();

  try {
    const result = await db
      .delete(webhookEndpointsTable)
      .where(eq(webhookEndpointsTable.apiKeyId, apiKeyId));

    return (result.count ?? 0) > 0;
  } catch (e) {
    throw StorageError.queryFailed(
      "Failed to delete webhook endpoint",
      e instanceof Error ? e : new Error(String(e))
    );
  }
}
