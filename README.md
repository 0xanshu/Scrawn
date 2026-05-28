# Scrawn Backend

Scrawn is a self-hostable billing backend built on [Bun](https://bun.sh), [Drizzle ORM](https://orm.drizzle.team), and [Dodo Payments](https://dodopayments.com). It exposes a gRPC API for high-throughput event ingestion and an HTTP API for webhooks and management, with pluggable storage between PostgreSQL and ClickHouse.

## Features

- **gRPC API** — high-throughput event ingestion, streaming batch registration, query service
- **HTTP API** — Dodo Payments webhooks, checkout redirects, tag/expression management
- **Dual storage** — PostgreSQL (relational) or ClickHouse (columnar analytics), swappable via env var
- **Authentication** — HMAC-based API key system with role scoping
- **Expressions** — dynamic pricing via configurable expression engine

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) (latest)
- Docker (for PostgreSQL and ClickHouse)
- Dodo Payments account

### 1. Clone and install

```bash
git clone https://github.com/ScrawnDotDev/Scrawn.git
cd Scrawn
bun install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/scrawn
CLICKHOUSE_URL=http://default:password@localhost:8123/scrawn
HMAC_SECRET=your-hmac-secret-key
DODO_PAYMENTS_API_KEY=your-dodo-api-key
DODO_PAYMENTS_WEBHOOK_SECRET=your-webhook-secret
STORAGE_ADAPTER=postgres   # or "clickhouse"
SENTRY_DSN=https://your-dsn@sentry.io/your-project
```

### 3. Start infrastructure

```bash
docker compose up -d
```

### 4. Run migrations

```bash
# Postgres (always required)
bunx drizzle-kit push

# ClickHouse (only if STORAGE_ADAPTER=clickhouse)
bun run migrate:clickhouse
```

### 5. Start the server

```bash
bun run dev:backend
```

The server starts on two ports:

- **gRPC** (h2c): `localhost:8069`
- **HTTP** (Fastify): `localhost:8070`

## API Overview

### gRPC Services

| Service          | RPC                | Description                                         |
| ---------------- | ------------------ | --------------------------------------------------- |
| AuthService      | CreateAPIKey       | Create a new API key                                |
| EventService     | RegisterEvent      | Register a single usage event                       |
| EventService     | StreamEvents       | Client-streaming batch event registration           |
| PaymentService   | CreateCheckoutLink | Generate a Dodo Payments checkout link              |
| QueryService     | QueryEvents        | Query events with filters, aggregation, group-by    |
| DataQueryService | Query              | Query internal tables (users, sessions, tags, etc.) |

### HTTP Endpoints

| Method   | Path                                | Purpose                    |
| -------- | ----------------------------------- | -------------------------- |
| GET      | `/`                                 | Health check               |
| GET      | `/checkout/:sessionId`              | Checkout redirect          |
| POST     | `/webhooks/payment/createdCheckout` | Dodo Payments webhook      |
| GET/POST | `/api/v1/tags`                      | Manage pricing tags        |
| GET/POST | `/api/v1/expressions`               | Manage pricing expressions |
| POST     | `/api/v1/internals/onboarding`      | Onboarding endpoint        |

## Storage Adapters

Scrawn supports two storage backends, switchable via the `STORAGE_ADAPTER` env var:

- **`postgres`** (default) — full relational schema via Drizzle ORM
- **`clickhouse`** — columnar analytics DB with `ReplacingMergeTree` for event deduplication

Only one adapter operates at a time across all event types.

## TLS (gRPC)

By default the gRPC server runs without TLS. In production, place it behind a TLS-terminating proxy or enable TLS directly:

```env
GRPC_TLS_ENABLED=true
GRPC_TLS_CERT_PATH="/path/to/server.crt"
GRPC_TLS_KEY_PATH="/path/to/server.key"
GRPC_TLS_CA_PATH="/path/to/ca.pem"
```

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup, testing, code style, and the PR process.

## Documentation

For complete API documentation and integration guides, visit the [Scrawn Docs](https://scrawn.vercel.app/docs).

## License

[MIT](./LICENSE)
