import { getPostgresDB } from "../db";
import { usersTable } from "../schema";
import { eq, and } from "drizzle-orm";
import { StorageError } from "../../../../errors/storage";
import type { PgTransaction } from "drizzle-orm/pg-core";

export async function updateUserBilledTimestamp(
  userId: string,
  billedUpto: string,
  txn?: PgTransaction<any, any, any>
): Promise<void> {
  const db = txn ?? getPostgresDB();

  try {
    await db
      .update(usersTable)
      .set({ last_billed_timestamp: billedUpto })
      .where(eq(usersTable.id, userId));
  } catch (e) {
    throw StorageError.queryFailed(
      "Failed to update user billed timestamp",
      e instanceof Error ? e : new Error(String(e))
    );
  }
}

export async function userExists(
  projectId: string,
  userId: string
): Promise<boolean> {
  const db = getPostgresDB();
  const result = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(eq(usersTable.projectId, projectId), eq(usersTable.id, userId)))
    .limit(1);
  return result.length > 0;
}

export async function ensureUserExists(
  projectId: string,
  userId: string,
  txn?: PgTransaction<any, any, any>
): Promise<void> {
  const db = txn ?? getPostgresDB();

  try {
    const [existing] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(
        and(eq(usersTable.projectId, projectId), eq(usersTable.id, userId))
      )
      .limit(1);

    if (existing) return;

    await db.insert(usersTable).values({ id: userId, projectId });
  } catch (e) {
    if (
      e instanceof Error &&
      (e.message.includes("duplicate") || e.message.includes("unique"))
    ) {
      return;
    }
    throw e;
  }
}
