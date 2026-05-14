import type { EventKind } from "../interface/event/Event.ts";
import { ClickHouseAdapter } from "../storage/adapter/clickhouse/ClickHouseAdapter.ts";

export class StorageAdapterFactory {
  public static async getEventStorageAdapter(RequestType: EventKind) {
    switch (RequestType) {
      case "SDK_CALL":
      case "AI_TOKEN_USAGE":
      case "PAYMENT": {
        return new ClickHouseAdapter();
      }
      default: {
        throw new Error(`Unknown event type: ${RequestType}`);
      }
    }
  }
}
