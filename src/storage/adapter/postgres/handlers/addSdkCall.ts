import { getPostgresDB } from "../../../db/postgres/db";
import { eventsTable, sdkCallEventsTable } from "../../../db/postgres/schema";
import { StorageError } from "../../../../errors/storage";
import { type SqlRecord } from "../../../../interface/event/Event";
import { DateTime } from "luxon";
import { StorageAdapterFactory } from "../../../../factory";
import { User } from "../../../../events/RawEvents/User";

export async function handleAddSdkCall(
  event_data: SqlRecord<"SDK_CALL">,
  apiKeyId: string
): Promise<{ id: string } | void> {
  const connectionObject = getPostgresDB();

  try {
    // Validate debit amount is not negative
    const debitAmount = event_data.data.debitAmount;
    if (typeof debitAmount === "number" && debitAmount < 0) {
      throw StorageError.insertFailed(
        `Negative debit amount not allowed for SDK call for user ${event_data.userId}`,
        new Error(`debitAmount ${debitAmount} is negative`)
      );
    }

    await connectionObject.transaction(async (txn) => {
      const adapter = await StorageAdapterFactory.getEventStorageAdapter("USER");
      const userEvent = new User({ id: event_data.userId });
      await adapter.add(userEvent.serialize(), "");

      // Validate and prepare timestamp
      let reported_timestamp;
      try {
        reported_timestamp = event_data.reported_timestamp.toISO();
      } catch (e) {
        throw StorageError.invalidTimestamp(
          "Failed to convert reported_timestamp to ISO format",
          e instanceof Error ? e : new Error(String(e))
        );
      }

      if (!reported_timestamp || reported_timestamp.trim().length === 0) {
        throw StorageError.invalidTimestamp(
          "Timestamp is undefined or empty after conversion"
        );
      }

      // Insert event
      let eventID;
      try {
        [eventID] = await txn
          .insert(eventsTable)
          .values({
            reported_timestamp,
            ingested_timestamp: DateTime.utc().toString(),
            userId: event_data.userId,
            api_keyId: apiKeyId,
          })
          .returning({ id: eventsTable.id });
      } catch (e) {
        throw StorageError.eventInsertFailed(
          `Failed to insert event for user ${event_data.userId}`,
          e instanceof Error ? e : new Error(String(e))
        );
      }

      if (!eventID) {
        throw StorageError.emptyResult("Event insert returned no ID");
      }

      // Insert SDK call event
      try {
        const sdkData = event_data;

        await txn.insert(sdkCallEventsTable).values({
          id: eventID.id,
          type: sdkData.data.sdkCallType,
          debitAmount: sdkData.data.debitAmount,
        });
      } catch (e) {
        throw StorageError.insertFailed(
          `Failed to insert SDK call event for event ID ${eventID.id}`,
          e instanceof Error ? e : new Error(String(e))
        );
      }

      return { id: eventID };
    });
  } catch (e) {
    // Use duck typing instead of instanceof to work with mocked modules
    if (
      e &&
      typeof e === "object" &&
      "type" in e &&
      (e as any).name === "StorageError"
    ) {
      throw e;
    }

    throw StorageError.transactionFailed(
      "Transaction failed while storing SDK_CALL event",
      e instanceof Error ? e : new Error(String(e))
    );
  }
}
