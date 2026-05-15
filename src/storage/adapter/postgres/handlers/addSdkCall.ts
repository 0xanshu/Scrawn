import { getPostgresDB } from "../../../db/postgres/db";
import { basicUsageEventsTable } from "../../../db/postgres/schema";
import { StorageError } from "../../../../errors/storage";
import { type SqlRecordOf } from "../../../../interface/event/Event";
import { DateTime } from "luxon";
import { ensureUserExists } from "../../../db/postgres/helpers/users";
import {
  validateAndPrepareTimestamp,
  executeInTransaction,
} from "./addEventUtils";

export async function handleAddSdkCall(
  event_data: SqlRecordOf<"SDK_CALL">,
  apiKeyId: string,
  mode: "production" | "test"
): Promise<{ id: string } | void> {
  const connectionObject = getPostgresDB();

  const debitAmount = event_data.data.debitAmount;
  if (typeof debitAmount === "number" && debitAmount < 0) {
    throw StorageError.insertFailed(
      `Negative debit amount not allowed for SDK call for user ${event_data.userId}`,
      new Error(`debitAmount ${debitAmount} is negative`)
    );
  }

  return await executeInTransaction(
    connectionObject,
    "storing SDK_CALL event",
    async (txn) => {
      await ensureUserExists(event_data.userId);

      const reportedTimestamp = await validateAndPrepareTimestamp(
        event_data.reported_timestamp
      );

      try {
        const [result] = await txn
          .insert(basicUsageEventsTable)
          .values({
            reportedTimestamp,
            ingestedTimestamp: DateTime.utc().toString(),
            userId: event_data.userId,
            apiKeyId: apiKeyId,
            mode,
            type: event_data.data.sdkCallType,
            debitAmount: event_data.data.debitAmount,
          })
          .returning({ id: basicUsageEventsTable.id });

        if (!result) {
          throw StorageError.emptyResult("SDK call insert returned no ID");
        }

        return { id: result.id };
      } catch (e) {
        throw StorageError.insertFailed(
          "Failed to insert SDK call event",
          e instanceof Error ? e : new Error(String(e))
        );
      }
    }
  );
}
