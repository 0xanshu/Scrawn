import type { sendUnaryData } from "@grpc/grpc-js";
import { QueryRequest, QueryResponse, Row } from "../../../gen/data/v1/data";
import { dataQuerySchema } from "../../../zod/data";
import { EventError } from "../../../errors/event";
import { AuthError } from "../../../errors/auth";
import { formatZodError } from "../../../utils/formatZodError";
import {
  getDataTable,
  executeDataQuery,
} from "../../../storage/query/dataQuery";
import type { WideEventBuilder } from "../../../context/requestContext";
import { wideEventContextKey } from "../../../context/requestContext";
import { apiKeyContextKey } from "../../../context/auth";
import type { ContextUnaryCall } from "../../../interface/types/context.js";

export async function queryData(
  call: ContextUnaryCall<QueryRequest, QueryResponse>,
  callback?: sendUnaryData<QueryResponse>
): Promise<void> {
  const wideEventBuilder = call[wideEventContextKey] as
    WideEventBuilder | undefined;

  try {
    const auth = call[apiKeyContextKey];
    if (!auth) {
      return callback?.(AuthError.invalidAPIKey("API key context not found"));
    }

    if (auth.role !== "dashboard") {
      return callback?.(
        AuthError.permissionDenied("Only dashboard keys can query data")
      );
    }

    const req = { ...call.request } as Record<string, unknown>;
    const validated = dataQuerySchema.parse(req);

    wideEventBuilder?.addContext({
      table: validated.table,
      operation: "query",
    });

    const tableDef = getDataTable(validated.table);
    if (!tableDef) {
      return callback?.(
        EventError.validationFailed(`Unknown table: ${validated.table}`)
      );
    }

    const result = await executeDataQuery(validated, tableDef);

    const response = QueryResponse.create();
    response.columns = result.columns;
    response.rows = result.rows.map((row) => {
      const r = Row.create();
      r.values = result.columns.map((c) => String(row[c] ?? ""));
      return r;
    });
    response.total = result.total;

    callback?.(null, response);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "name" in error &&
      (error as Error).name === "ZodError"
    ) {
      const formatted = formatZodError(error, (msg) =>
        EventError.validationFailed(msg)
      );
      return callback?.(formatted as Error);
    }
    callback?.(error as Error);
  }
}
