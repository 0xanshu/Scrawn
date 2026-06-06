# Scrawn Backend

Scrawn is a **self-hostable usage-based billing backend** that replaces 60+ lines of billing boilerplate with a single function call. It ingests billable events, evaluates your pricing logic, and hooks into [Dodo Payments](https://dodopayments.com) for collection — no cron jobs, no manual gRPC plumbing.

Built on [Bun](https://bun.sh), [Fastify](https://fastify.dev), [gRPC](https://grpc.io), and [PostgreSQL](https://postgresql.org) / [ClickHouse](https://clickhouse.com).

## Prerequisites

- [Bun](https://bun.sh)
- [Docker](https://docker.com)
- A [Dodo Payments](https://dodopayments.com) account

## Quick Start

The [Scrawn CLI](https://github.com/ScrawnDotDev/CLI) automates the entire local stack — just run:

```bash
bunx scrawn@latest init
bunx scrawn@latest start
```

This generates the docker-compose config and starts PostgreSQL, ClickHouse, the gRPC server, and the dashboard — all in the background.

### Stop & Reset

```bash
bunx scrawn@latest stop    # Graceful stop, preserves data
bunx scrawn@latest reset   # Wipes all data volumes
```

## SDK Integration

```ts
import { scrawn } from "@scrawn/core";

const biller = scrawn({
  apiKey: process.env.SCRAWN_KEY,
  baseURL: process.env.SCRAWN_BASE_URL,
  httpUrl: process.env.SCRAWN_HTTP_URL,
});

// Track usage in one line
await biller.basicUsageEventConsumer({
  userId: "cus_123",
  debit: 4500,
});
```

## Docs

Complete API reference and integration guides: [scrawn.vercel.app/docs](https://scrawn.vercel.app/docs)

## License

[MIT](./LICENSE)
