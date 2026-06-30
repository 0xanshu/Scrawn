import { eq, and, isNull } from "drizzle-orm";
import { EventError } from "../errors/event";
import { getPostgresDB } from "../storage/db/postgres/db";
import { tagsTable } from "../storage/db/postgres/schema";
import { tagCache } from "./tagCache";

export async function fetchTagAmount(
  projectId: string,
  tag: string,
  notFoundMessage: string
): Promise<number> {
  const cacheKey = `${projectId}:${tag}`;
  const cachedAmount = tagCache.get(cacheKey);
  if (cachedAmount !== undefined) {
    return cachedAmount;
  }

  const db = getPostgresDB();
  const [tagRow] = await db
    .select()
    .from(tagsTable)
    .where(
      and(
        eq(tagsTable.projectId, projectId),
        eq(tagsTable.key, tag),
        isNull(tagsTable.deletedAt)
      )
    )
    .limit(1);

  if (!tagRow) {
    throw EventError.validationFailed(notFoundMessage);
  }

  tagCache.set(cacheKey, tagRow.amount);
  return tagRow.amount;
}
