import { z } from "zod";

const ALLOWED_FIELDS = [
  "eventType",
  "reportedTimestamp",
  "ingestedTimestamp",
  "userId",
  "apiKeyId",
  "sdkCallType",
  "debitAmount",
  "creditAmount",
  "model",
  "inputTokens",
  "outputTokens",
  "inputDebitAmount",
  "outputDebitAmount",
] as const;

const OPERATOR_MAP = {
  0: "EQ",
  1: "EQ",
  2: "GT",
  3: "GTE",
  4: "LT",
  5: "LTE",
  6: "NEQ",
} as const;

const AGGREGATION_TYPE_MAP = {
  1: "SUM",
  2: "COUNT",
} as const;

const filterConditionSchema = z.object({
  field: z.enum(ALLOWED_FIELDS),
  operator: z
    .number()
    .int()
    .min(1)
    .max(6)
    .transform((v) => OPERATOR_MAP[v as keyof typeof OPERATOR_MAP]),
  value: z.string(),
});

const filterGroupSchema: z.ZodType<{
  logical: number;
  conditionsList: z.infer<typeof filterConditionSchema>[];
  groupsList: unknown[];
}> = z.lazy(() =>
  z.object({
    logical: z.number().int().min(0).max(2).default(1),
    conditionsList: z.array(filterConditionSchema).default([]),
    groupsList: z.array(filterGroupSchema).default([]),
  })
);

const aggregationSchema = z.object({
  type: z
    .number()
    .int()
    .min(1)
    .max(2)
    .transform(
      (v) => AGGREGATION_TYPE_MAP[v as keyof typeof AGGREGATION_TYPE_MAP]
    ),
  field: z.string(),
});

const groupBySchema = z.object({
  field: z.enum(ALLOWED_FIELDS),
});

export const queryEventsSchema = z.object({
  where: filterGroupSchema.optional(),
  aggregation: aggregationSchema.optional(),
  groupBy: groupBySchema.optional(),
  limit: z.number().int().min(1).max(1000).default(100),
  offset: z.number().int().min(0).default(0),
});

export type QueryEventsSchemaType = z.output<typeof queryEventsSchema>;
