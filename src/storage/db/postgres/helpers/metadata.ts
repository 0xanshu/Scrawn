import { getPostgresDB } from "../db";
import { metadataTable } from "../schema";
import { StorageError } from "../../../../errors/storage";
import { eq } from "drizzle-orm";

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
