import { getPostgresDB } from "../../../db/postgres/db";
import { usersTable } from "../../../db/postgres/schema";
import { type SqlRecord } from "../../../../interface/event/Event.ts";

export async function handleAddUser(
  event_data: SqlRecord<"USER">
): Promise<{ id: string }> {
  const connectionObject = getPostgresDB();
  const userId = event_data.data.id;

  try {
    await connectionObject.insert(usersTable)
      .values({ id: userId })
      .onConflictDoNothing({ target: usersTable.id });
  } catch (e) {
    if (
      e instanceof Error &&
      (e.message.includes("duplicate") || e.message.includes("unique"))
    ) {
      return { id: userId };
    }
    throw e;
  }

  return { id: userId };
}