import type { TestDBAdapter } from "./types";

export type { TestDBAdapter, NormalizedBasicUsageEvent } from "./types";

async function resolveAdapter(): Promise<TestDBAdapter> {
  if (process.env.STORAGE_ADAPTER === "clickhouse") {
    const { ClickHouseTestDB } = await import("./clickhouse");
    return new ClickHouseTestDB();
  }
  const { PostgresTestDB } = await import("./postgres");
  return new PostgresTestDB();
}

export const testDB: Promise<TestDBAdapter> = resolveAdapter();
