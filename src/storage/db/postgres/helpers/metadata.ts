import { getPostgresDB } from "../db";
import { metadataTable } from "../schema";
import { StorageError } from "../../../../errors/storage";
import { eq } from "drizzle-orm";
import { executeInTransaction } from "../../../adapter/postgres/handlers/addEventUtils";

export type UpsertMetadataInput = {
  dodo_live_api_key: string;
  dodo_test_api_key: string;
  dodo_live_product_id: string;
  dodo_test_product_id: string;
  dodo_live_webhook_secret: string;
  dodo_test_webhook_secret: string;
  currency: string;
  redirect_url: string;
};

export async function createMetadata(
  projectId: string,
  input: UpsertMetadataInput,
  txn?: any
): Promise<void> {
  const db = txn ?? getPostgresDB();

  try {
    await db.insert(metadataTable).values({
      projectId,
      dodo_live_api_key: input.dodo_live_api_key,
      dodo_test_api_key: input.dodo_test_api_key,
      dodo_live_product_id: input.dodo_live_product_id,
      dodo_test_product_id: input.dodo_test_product_id,
      dodo_live_webhook_secret: input.dodo_live_webhook_secret,
      dodo_test_webhook_secret: input.dodo_test_webhook_secret,
      currency: input.currency,
      redirect_url: input.redirect_url,
    });
  } catch (e) {
    throw StorageError.insertFailed(
      "Failed to create metadata record",
      e instanceof Error ? e : new Error(String(e))
    );
  }
}

export async function getMetadata(
  projectId: string
): Promise<typeof metadataTable.$inferSelect | undefined> {
  const db = getPostgresDB();
  const [metadata] = await db
    .select()
    .from(metadataTable)
    .where(eq(metadataTable.projectId, projectId))
    .limit(1);
  return metadata;
}
