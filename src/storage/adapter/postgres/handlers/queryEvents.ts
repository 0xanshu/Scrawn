import { getPostgresDB } from "../../../db/postgres/db";
import {
  eventsTable,
  sdkCallEventsTable,
  aiTokenUsageEventsTable,
  paymentEventsTable,
} from "../../../db/postgres/schema";
import { StorageError } from "../../../../errors/storage";
import {
  eq,
  gt,
  gte,
  lt,
  lte,
  ne,
  and,
  or,
  sql,
  count,
  sum,
} from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type {
  QueryRequest,
  QueryFilter,
  QueryFilterGroup,
  QueryResponse,
  QueryResultRow,
} from "../../../../interface/storage/Storage";
import { type AnyPgColumn } from "drizzle-orm/pg-core";

type EventTypeName = "SDK_CALL" | "AI_TOKEN_USAGE" | "PAYMENT";

interface PgFieldDef {
  column: AnyPgColumn | null;
  cast: "text" | "integer" | "uuid" | "timestamptz";
}

const PG_FIELDS: Record<EventTypeName, Record<string, PgFieldDef>> = {
  SDK_CALL: {
    eventId: { column: eventsTable.id, cast: "uuid" },
    eventType: { column: null, cast: "text" },
    userId: { column: eventsTable.userId, cast: "uuid" },
    apiKeyId: { column: eventsTable.api_keyId, cast: "uuid" },
    reportedTimestamp: {
      column: eventsTable.reported_timestamp,
      cast: "timestamptz",
    },
    ingestedTimestamp: {
      column: eventsTable.ingested_timestamp,
      cast: "timestamptz",
    },
    sdkCallType: { column: sdkCallEventsTable.type, cast: "text" },
    debitAmount: { column: sdkCallEventsTable.debitAmount, cast: "integer" },
    model: { column: null, cast: "text" },
    inputTokens: { column: null, cast: "integer" },
    outputTokens: { column: null, cast: "integer" },
    inputDebitAmount: { column: null, cast: "integer" },
    outputDebitAmount: { column: null, cast: "integer" },
    creditAmount: { column: null, cast: "integer" },
  },
  AI_TOKEN_USAGE: {
    eventId: { column: eventsTable.id, cast: "uuid" },
    eventType: { column: null, cast: "text" },
    userId: { column: eventsTable.userId, cast: "uuid" },
    apiKeyId: { column: eventsTable.api_keyId, cast: "uuid" },
    reportedTimestamp: {
      column: eventsTable.reported_timestamp,
      cast: "timestamptz",
    },
    ingestedTimestamp: {
      column: eventsTable.ingested_timestamp,
      cast: "timestamptz",
    },
    sdkCallType: { column: null, cast: "text" },
    debitAmount: { column: null, cast: "integer" },
    model: { column: aiTokenUsageEventsTable.model, cast: "text" },
    inputTokens: {
      column: aiTokenUsageEventsTable.inputTokens,
      cast: "integer",
    },
    outputTokens: {
      column: aiTokenUsageEventsTable.outputTokens,
      cast: "integer",
    },
    inputDebitAmount: {
      column: aiTokenUsageEventsTable.inputDebitAmount,
      cast: "integer",
    },
    outputDebitAmount: {
      column: aiTokenUsageEventsTable.outputDebitAmount,
      cast: "integer",
    },
    creditAmount: { column: null, cast: "integer" },
  },
  PAYMENT: {
    eventId: { column: eventsTable.id, cast: "uuid" },
    eventType: { column: null, cast: "text" },
    userId: { column: eventsTable.userId, cast: "uuid" },
    apiKeyId: { column: eventsTable.api_keyId, cast: "uuid" },
    reportedTimestamp: {
      column: eventsTable.reported_timestamp,
      cast: "timestamptz",
    },
    ingestedTimestamp: {
      column: eventsTable.ingested_timestamp,
      cast: "timestamptz",
    },
    sdkCallType: { column: null, cast: "text" },
    debitAmount: { column: null, cast: "integer" },
    model: { column: null, cast: "text" },
    inputTokens: { column: null, cast: "integer" },
    outputTokens: { column: null, cast: "integer" },
    inputDebitAmount: { column: null, cast: "integer" },
    outputDebitAmount: { column: null, cast: "integer" },
    creditAmount: { column: paymentEventsTable.creditAmount, cast: "integer" },
  },
};

function applyOp(col: AnyPgColumn, filter: QueryFilter): SQL {
  switch (filter.operator) {
    case "EQ":
      return eq(col, filter.value);
    case "GT":
      return gt(col, filter.value);
    case "GTE":
      return gte(col, filter.value);
    case "LT":
      return lt(col, filter.value);
    case "LTE":
      return lte(col, filter.value);
    case "NEQ":
      return ne(col, filter.value);
    default:
      return eq(col, filter.value);
  }
}

function buildConditions(
  eventType: EventTypeName,
  group: QueryFilterGroup
): SQL | undefined {
  const fields = PG_FIELDS[eventType];
  const resolveColumn = (filter: QueryFilter): SQL | null => {
    if (filter.field === "eventType") return null;
    const def = fields[filter.field];
    if (!def?.column) return null;
    return applyOp(def.column, filter);
  };
  return buildConditionsFromGroup(group, resolveColumn);
}

function buildConditionsFromGroup(
  group: QueryFilterGroup,
  resolveColumn: (filter: QueryFilter) => SQL | null
): SQL | undefined {
  const parts: SQL[] = [];

  for (const condition of group.conditions) {
    if (condition.field === "eventType") continue;
    const clause = resolveColumn(condition);
    if (clause) parts.push(clause);
  }

  for (const subGroup of group.groups) {
    const subWhere = buildConditionsFromGroup(subGroup, resolveColumn);
    if (subWhere) parts.push(subWhere);
  }

  if (parts.length === 0) return undefined;
  return group.logical === "OR" ? or(...parts) : and(...parts);
}

function getEventTypes(where: QueryFilterGroup): EventTypeName[] {
  const collect = (group: QueryFilterGroup): string[] => {
    const types: string[] = [];
    const et = group.conditions.find((c) => c.field === "eventType");
    if (et) types.push(et.value);
    for (const sub of group.groups) {
      types.push(...collect(sub));
    }
    return types;
  };

  const types = collect(where);
  if (types.length > 0) {
    return types.filter(
      (t): t is EventTypeName =>
        t === "SDK_CALL" || t === "AI_TOKEN_USAGE" || t === "PAYMENT"
    );
  }
  return ["SDK_CALL", "AI_TOKEN_USAGE", "PAYMENT"];
}

function buildSelect(eventType: EventTypeName) {
  const fields = PG_FIELDS[eventType];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: Record<string, any> = {};

  for (const [field, def] of Object.entries(fields)) {
    if (field === "eventType") {
      result[field] = sql<string>`${sql.raw(`'${eventType}'`)}`.as("eventType");
    } else if (def.column) {
      result[field] = def.column;
    } else {
      const nullSql =
        def.cast === "integer" ? sql<number>`NULL::integer` : sql<string>`NULL`;
      result[field] = (nullSql as ReturnType<typeof sql>).as(field);
    }
  }

  return result;
}

function getSubtypeTable(
  eventType: EventTypeName
): typeof sdkCallEventsTable | typeof aiTokenUsageEventsTable | typeof paymentEventsTable {
  if (eventType === "SDK_CALL") return sdkCallEventsTable;
  if (eventType === "PAYMENT") return paymentEventsTable;
  return aiTokenUsageEventsTable;
}

function getSelect(eventType: EventTypeName) {
  return buildSelect(eventType);
}

function getConditions(
  eventType: EventTypeName,
  where: QueryFilterGroup
): SQL | undefined {
  return buildConditions(eventType, where);
}

export async function handleQueryEvents(
  request: QueryRequest
): Promise<QueryResponse> {
  const db = getPostgresDB();
  const eventTypes = getEventTypes(request.where);
  const isAgg = !!request.aggregation;

  if (eventTypes.length === 0) {
    return { rows: [], total: 0 };
  }

  try {
    if (isAgg) {
      return await handleAggregationQuery(db, request, eventTypes);
    }
    return await handleListQuery(db, request, eventTypes);
  } catch (e) {
    if (
      e &&
      typeof e === "object" &&
      "type" in e &&
      (e as Record<string, unknown>).name === "StorageError"
    ) {
      throw e;
    }
    throw StorageError.queryFailed(
      "Failed to query Postgres events",
      e instanceof Error ? e : new Error(String(e))
    );
  }
}

async function queryListForType(
  db: ReturnType<typeof getPostgresDB>,
  request: QueryRequest,
  eventType: EventTypeName
): Promise<{ rows: QueryResultRow[]; total: number }> {
  const subtypeTable = getSubtypeTable(eventType);
  const selectCols = getSelect(eventType);
  const whereClause = getConditions(eventType, request.where);

  // Count
  const [countResult, rows] = await Promise.all([
    db
      .select({ cnt: count() })
      .from(eventsTable)
      .innerJoin(subtypeTable, eq(eventsTable.id, subtypeTable.id))
      .where(whereClause)
      .execute(),
    db
      .select(selectCols)
      .from(eventsTable)
      .innerJoin(subtypeTable, eq(eventsTable.id, subtypeTable.id))
      .where(whereClause)
      .orderBy(sql`${eventsTable.reported_timestamp} DESC`)
      .execute(),
  ]);

  const total = Number(countResult[0]?.cnt ?? 0);

  return { rows, total };
}

async function handleListQuery(
  db: ReturnType<typeof getPostgresDB>,
  request: QueryRequest,
  eventTypes: EventTypeName[]
): Promise<QueryResponse> {
  const allRows: QueryResultRow[] = [];
  let totalCount = 0;

  for (const eventType of eventTypes) {
    const result = await queryListForType(db, request, eventType);
    allRows.push(...result.rows);
    totalCount += result.total;
  }

  allRows.sort((a, b) => {
    const aTs = String(a.reportedTimestamp ?? "");
    const bTs = String(b.reportedTimestamp ?? "");
    return bTs.localeCompare(aTs);
  });

  const offset = request.offset ?? 0;
  const limit = request.limit ?? 100;
  const paginated = limit > 0 ? allRows.slice(offset, offset + limit) : allRows;

  return { rows: paginated, total: totalCount };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveAggCol(
  eventType: EventTypeName,
  isSum: boolean,
  field?: string
): any {
  if (!isSum || !field) return count().mapWith(Number);
  const col = PG_FIELDS[eventType]?.[field]?.column;
  if (!col) return count().mapWith(Number);
  return sum(col).mapWith(Number);
}

async function handleAggregationQuery(
  db: ReturnType<typeof getPostgresDB>,
  request: QueryRequest,
  eventTypes: EventTypeName[]
): Promise<QueryResponse> {
  const agg = request.aggregation!;
  const isSum = agg.type === "SUM";
  const rows: QueryResultRow[] = [];

  for (const eventType of eventTypes) {
    const subtypeTable = getSubtypeTable(eventType);
    const whereClause = getConditions(eventType, request.where);

    if (request.groupBy && request.groupBy !== "eventType") {
      const gbCol = PG_FIELDS[eventType]?.[request.groupBy]?.column;
      if (!gbCol) continue;

      const aggCol = resolveAggCol(eventType, isSum, agg.field);

      const result = await db
        .select({
          group_value: gbCol,
          agg_value: aggCol,
        })
        .from(eventsTable)
        .innerJoin(subtypeTable, eq(eventsTable.id, subtypeTable.id))
        .where(whereClause)
        .groupBy(gbCol)
        .execute();

      for (const r of result) {
        rows.push({
          group_value: String(r.group_value ?? ""),
          agg_value: String(r.agg_value ?? "0"),
        });
      }
    } else {
      const aggCol = resolveAggCol(eventType, isSum, agg.field);

      const result = await db
        .select({ agg_value: aggCol })
        .from(eventsTable)
        .innerJoin(subtypeTable, eq(eventsTable.id, subtypeTable.id))
        .where(whereClause)
        .execute();

      const row: QueryResultRow = {};
      if (request.groupBy === "eventType") {
        row.group_value = eventType;
      }
      row.agg_value = String(result[0]?.agg_value ?? "0");
      rows.push(row);
    }
  }

  return { rows, total: rows.length };
}
