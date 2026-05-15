import { getPostgresDB } from "../../../db/postgres/db";
import { paymentEventsTable } from "../../../db/postgres/schema";
import { StorageError } from "../../../../errors/storage";
import { type SqlRecordOf } from "../../../../interface/event/Event";
import { DateTime } from "luxon";
import * as Sentry from "@sentry/bun";
import {
  validateAndPrepareTimestamp,
  ensureUserExists,
  executeInTransaction,
  userExists,
} from "./addEventUtils";

export async function handleAddPayment(
  event_data: SqlRecordOf<"PAYMENT">,
  apiKeyId: string,
  mode: "production" | "test"
): Promise<{ id: string } | void> {
  const connectionObject = getPostgresDB();

  const creditAmount = event_data?.data?.creditAmount;

  if (
    creditAmount === undefined ||
    creditAmount === null ||
    typeof creditAmount !== "number" ||
    !Number.isFinite(creditAmount) ||
    creditAmount < 0
  ) {
    throw StorageError.invalidData(
      `Invalid creditAmount: must be a positive finite number, got ${String(
        creditAmount
      )}`
    );
  }

  return await executeInTransaction(
    connectionObject,
    "storing PAYMENT event",
    async (txn) => {
      const exists = await userExists(event_data.userId);
      if (!exists) {
        Sentry.captureMessage(
          `Payment received for non-existent user, auto-creating: ${event_data.userId}`,
          {
            level: "warning",
            contexts: {
              payment: {
                userId: event_data.userId,
                creditAmount: creditAmount,
                reportedTimestamp: event_data.reported_timestamp?.toISO(),
              },
            },
          }
        );
      }

      await ensureUserExists(event_data.userId);

      const reportedTimestamp = await validateAndPrepareTimestamp(
        event_data.reported_timestamp
      );

      try {
        const [result] = await txn
          .insert(paymentEventsTable)
          .values({
            reportedTimestamp,
            ingestedTimestamp: DateTime.utc().toString(),
            userId: event_data.userId,
            apiKeyId: apiKeyId,
            mode,
            creditAmount: event_data.data.creditAmount,
          })
          .returning({ id: paymentEventsTable.id });

        if (!result) {
          throw StorageError.emptyResult("Payment event insert returned no ID");
        }

        return { id: result.id };
      } catch (e) {
        throw StorageError.insertFailed(
          "Failed to insert payment event",
          e instanceof Error ? e : new Error(String(e))
        );
      }
    }
  );
}
