import { getPostgresDB } from "../db";
import { tagsTable } from "../schema";
import { eq, and, isNull } from "drizzle-orm";
import { StorageError } from "../../../../errors/storage";
import { DateTime } from "luxon";
import { tagCache } from "../../../../utils/tagCache";

export async function listTags(
  projectId: string
): Promise<{ key: string; amount: number }[]> {
  const db = getPostgresDB();

  try {
    const rows = await db
      .select({ key: tagsTable.key, amount: tagsTable.amount })
      .from(tagsTable)
      .where(
        and(eq(tagsTable.projectId, projectId), isNull(tagsTable.deletedAt))
      );
    return rows;
  } catch (e) {
    throw StorageError.queryFailed(
      "Failed to list tags",
      e instanceof Error ? e : new Error(String(e))
    );
  }
}

export async function createTag(
  projectId: string,
  key: string,
  amount: number
): Promise<void> {
  const db = getPostgresDB();

  try {
    await db
      .insert(tagsTable)
      .values({ projectId, key, amount })
      .onConflictDoUpdate({
        target: [tagsTable.projectId, tagsTable.key],
        targetWhere: isNull(tagsTable.deletedAt),
        set: { amount },
      });

    tagCache.delete(`${projectId}:${key}`);
  } catch (e) {
    throw StorageError.insertFailed(
      `Failed to upsert tag '${key}'`,
      e instanceof Error ? e : new Error(String(e))
    );
  }
}

export async function deleteTag(
  projectId: string,
  key: string
): Promise<boolean> {
  const db = getPostgresDB();

  try {
    const now = DateTime.utc().toISO();
    const result = await db
      .update(tagsTable)
      .set({ deletedAt: now })
      .where(
        and(
          eq(tagsTable.projectId, projectId),
          eq(tagsTable.key, key),
          isNull(tagsTable.deletedAt)
        )
      );

    if ((result.count ?? 0) > 0) {
      tagCache.delete(`${projectId}:${key}`);
      return true;
    }
    return false;
  } catch (e) {
    throw StorageError.queryFailed(
      `Failed to soft-delete tag '${key}'`,
      e instanceof Error ? e : new Error(String(e))
    );
  }
}
