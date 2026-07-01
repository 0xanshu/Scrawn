import type {
  QueryRequest,
  QueryResponse,
  QueryFilterGroup,
} from "../../../interface/storage/Storage";
import type { EventTableName } from "../common/queryEventsBase";

export interface QueryDialect {
  filterTables(tables: EventTableName[]): EventTableName[];

  executeListQuery(
    request: QueryRequest,
    tables: EventTableName[]
  ): Promise<QueryResponse>;

  executeAggregationQuery(
    request: QueryRequest,
    tables: EventTableName[]
  ): Promise<QueryResponse>;

  getTotalCount(
    request: QueryRequest,
    tables: EventTableName[]
  ): Promise<number>;
}
