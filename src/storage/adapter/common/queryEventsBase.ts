import type {
  QueryFilterGroup,
  QueryFilter,
} from "../../../interface/storage/Storage";

export type EventTypeLabel = "BASIC_USAGE" | "AI_TOKEN_USAGE" | "PAYMENT";

export type EventTableName =
  "basic_usage_events" | "ai_token_usage_events" | "payment_events";

const EVENT_TYPE_TO_TABLE: Record<EventTypeLabel, EventTableName> = {
  BASIC_USAGE: "basic_usage_events",
  AI_TOKEN_USAGE: "ai_token_usage_events",
  PAYMENT: "payment_events",
};

export const TABLE_TO_EVENT_TYPE: Record<EventTableName, EventTypeLabel> = {
  basic_usage_events: "BASIC_USAGE",
  ai_token_usage_events: "AI_TOKEN_USAGE",
  payment_events: "PAYMENT",
};

const ALL_EVENT_TYPES: EventTypeLabel[] = [
  "BASIC_USAGE",
  "AI_TOKEN_USAGE",
  "PAYMENT",
];

const ALL_TABLES: EventTableName[] = [
  "basic_usage_events",
  "ai_token_usage_events",
  "payment_events",
];

export const OPERATOR_SQL: Record<string, string> = {
  EQ: "=",
  GT: ">",
  GTE: ">=",
  LT: "<",
  LTE: "<=",
  NEQ: "!=",
};

function canTableMatch(
  group: QueryFilterGroup,
  table: EventTableName
): boolean {
  const tableEventType = TABLE_TO_EVENT_TYPE[table];

  const conditionResults = group.conditions.map((c) => {
    if (c.field === "eventType") {
      if (c.operator === "EQ") return c.value === tableEventType;
      if (c.operator === "NEQ") return c.value !== tableEventType;
      return true;
    }
    return true;
  });

  const groupResults = group.groups.map((g) => canTableMatch(g, table));
  const allResults = [...conditionResults, ...groupResults];

  if (allResults.length === 0) return true;

  if (group.logical === "AND") {
    return allResults.every((res) => res);
  } else {
    return allResults.some((res) => res);
  }
}

export function getTablesForRequest(where: QueryFilterGroup): EventTableName[] {
  return ALL_TABLES.filter((table) => canTableMatch(where, table));
}
