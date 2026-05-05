import { getPostgresDB } from "../../../db/postgres/db";
import { eventsTable } from "../../../db/postgres/schema";
import { StorageError } from "../../../../errors/storage";
import { DateTime } from "luxon";
import { StorageAdapterFactory } from "../../../../factory";
import { User } from "../../../../events/RawEvents/User";
import type { PgTransaction } from "drizzle-orm/pg-core";

export async function validateAndPrepareTimestamp(
  reported_timestamp: DateTime
): Promise<string> {
  let timestamp: string | null = null;
  try {
    timestamp = reported_timestamp.toISO();
  } catch (e) {
    throw StorageError.invalidTimestamp(
      "Failed to convert reported_timestamp to ISO format",
      e instanceof Error ? e : new Error(String(e))
    );
  }

  if (!timestamp || timestamp.trim().length === 0) {
    throw StorageError.invalidTimestamp(
      "Timestamp is undefined or empty after conversion"
    );
  }

  return timestamp;
}

export type EventInsertValues = {
  reported_timestamp: string;
  ingested_timestamp: string;
  userId: string;
  api_keyId: string | undefined;
};

export async function insertEvent(
  txn: PgTransaction<any, any, any>,
  values: EventInsertValues
): Promise<{ id: string }> {
  let eventID;
  try {
    [eventID] = await txn
      .insert(eventsTable)
      .values({
        reported_timestamp: values.reported_timestamp,
        ingested_timestamp: values.ingested_timestamp,
        userId: values.userId,
        api_keyId: values.api_keyId,
      })
      .returning({ id: eventsTable.id });
  } catch (e) {
    throw StorageError.eventInsertFailed(
      `Failed to insert event for user ${values.userId}`,
      e instanceof Error ? e : new Error(String(e))
    );
  }

  if (!eventID) {
    throw StorageError.emptyResult("Event insert returned no ID");
  }

  return { id: eventID.id };
}

export async function ensureUserExists(
  userId: string
): Promise<void> {
  const adapter = await StorageAdapterFactory.getEventStorageAdapter("USER");
  const userEvent = new User({ id: userId });
  await adapter.add(userEvent.serialize(), "");
}