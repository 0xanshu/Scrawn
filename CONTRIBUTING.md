# Contributing to Scrawn

Thank you for your interest in contributing! This document covers everything you need to get a development environment running, write and run tests, follow code conventions, and submit a pull request.

## Table of Contents

- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Code Style](#code-style)
- [Testing](#testing)
- [Scripts Reference](#scripts-reference)
- [Submitting a Pull Request](#submitting-a-pull-request)

## Development Setup

### Prerequisites

- [Bun](https://bun.sh) (latest)
- Docker (used to run PostgreSQL and ClickHouse locally)

### Steps

1. **Fork and clone**

   ```bash
   git clone https://github.com/<your-fork>/Scrawn.git
   cd Scrawn
   ```

2. **Install dependencies**

   ```bash
   bun install
   ```

3. **Configure environment**

   ```bash
   cp .env.example .env.local
   ```

   Fill in `.env.local` — at minimum you need `DATABASE_URL`, `HMAC_SECRET`, and `DODO_PAYMENTS_API_KEY`. For ClickHouse development also add `CLICKHOUSE_URL` and set `STORAGE_ADAPTER=clickhouse`.

4. **Start infrastructure**

   ```bash
   docker compose up -d
   ```

5. **Run migrations**

   ```bash
   # Postgres (always required)
   bunx drizzle-kit push

   # ClickHouse (only if STORAGE_ADAPTER=clickhouse)
   bun run migrate:clickhouse
   ```

6. **Start the dev server**

   ```bash
   bun run dev:backend
   ```

   This starts the gRPC server on `:8069` and the Fastify HTTP server on `:8070` with auto-reload.

---

## Project Structure

```text
src/
  config/           — env parsing and constants
  errors/           — typed error classes and the WideEventLogger
  gen/              — generated protobuf types (do not edit by hand)
  interceptors/     — gRPC server interceptors (auth, logging)
  routes/
    gRPC/           — gRPC service implementations
    http/           — Fastify route handlers (webhooks, API)
  servers/          — gRPC and Fastify server bootstrap
  storage/
    adapter/        — PostgresAdapter and ClickHouseAdapter
    db/
      postgres/     — Drizzle schema + DB singleton
      clickhouse/   — ClickHouse client singleton + migrations
  utils/            — shared utilities (hashing, API key generation, etc.)
  zod/              — Zod schemas for request validation
  __tests__/
    fixtures/       — test data factories (API keys, gRPC clients)
    db/             — storage-adapter-agnostic test DB interface
    assertions/     — reusable assertion helpers per domain
proto/              — protobuf definitions (git submodule)
drizzle/            — Drizzle migration files
```

---

## Code Style

We use TypeScript in strict mode with Bun as the runtime. Run `bun run typecheck` and `bun run format` before committing — these are enforced by Husky pre-commit hooks.

### Key conventions

- **Imports** — use `import type` for type-only imports
- **Types** — always type function parameters and return values; avoid `any`; don't cast what can be inferred
- **Error handling** — use custom error classes (`AuthError`, `StorageError`, etc.) with static factory methods; always include `type`, `message`, and optional `originalError`
- **Validation** — use Zod schemas for all incoming request data; catch `ZodError` and convert to domain errors
- **Logging** — use `WideEventLogger` from `errors/logger`
  - `logger.emit()` with a `WideEvent` for request-scoped logs
  - `logger.lifecycle()` / `logger.lifecycleWarning()` for server startup/shutdown events
- **Naming**
  - `camelCase` — variables and functions
  - `PascalCase` — classes, types, enums
  - `SCREAMING_SNAKE_CASE` — module-level constants
- **Database** — use Drizzle ORM with transactions; validate all inputs before DB writes; handle unique constraint violations explicitly
- **Dates** — only use Luxon `DateTime`; never use the built-in `Date`
  - Always work in UTC: `DateTime.utc()`, never `DateTime.now()` or `DateTime.local()`
  - Parse with `DateTime.fromISO(str, { zone: "utc" })` — never omit `{ zone: "utc" }`
  - Call `.toUTC()` on any `DateTime` that might have entered with a local zone

### Protobuf

Generated types live in `src/gen/` — don't edit them by hand. If you change a `.proto` definition, run `bun run gen` to regenerate.

---

## Testing

Integration tests use [Vitest](https://vitest.dev) and run against real infrastructure (Postgres and ClickHouse) on isolated ports. The test suite is run against **both storage adapters** to ensure adapter parity.

### 1. Configure test environment

```bash
cp .env.example .env.test
```

Edit `.env.test` to point at the test instances:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/scrawn_test
CLICKHOUSE_URL=http://default:clickhouse@localhost:8124/scrawn_test
```

### 2. Start test infrastructure

```bash
docker compose -f docker-compose.test.yml up -d
```

This starts PostgreSQL on port `5433` and ClickHouse on port `8124` — separate from the dev stack so both can run simultaneously.

### 3. Run tests

```bash
# Both adapters (recommended before opening a PR)
bun run test:all

# Postgres only
bun run test:postgres

# ClickHouse only
bun run test:clickhouse

# Interactive UI
bun run test:ui
```

The test suite spins up gRPC (`:18069`) and Fastify (`:18070`) servers internally so tests don't conflict with a running dev server.

### Test structure

```text
src/__tests__/
  fixtures/
    grpc.ts          — gRPC client helpers and typed RPC wrappers
    apiKey.ts        — createTestApiKey() and other DB seed factories
  db/
    types.ts         — NormalizedBasicUsageEvent, TestDBAdapter interface
    index.ts         — getTestDB() singleton (picks adapter from STORAGE_ADAPTER)
    postgres.ts      — PostgresTestDB — queries Drizzle, normalizes to shared shape
    clickhouse.ts    — ClickHouseTestDB — queries ClickHouse, normalizes to shared shape
  assertions/
    events.ts        — verifyBasicUsageEventStored() and friends
  setup.ts           — Vitest globalSetup: starts servers, wires DB connections
  events.test.ts     — EventService integration tests
```

When adding new assertions, implement `findX()` on both `PostgresTestDB` and `ClickHouseTestDB`, then write the assertion function in `assertions/` against the normalized shape — no `if (STORAGE_ADAPTER)` branching in assertions.

---

## Scripts Reference

| Script                       | Description                                   |
| ---------------------------- | --------------------------------------------- |
| `bun run dev:backend`        | Start dev server with auto-reload             |
| `bun start`                  | Start production server                       |
| `bun run test:all`           | Run integration tests against both adapters   |
| `bun run test:postgres`      | Run integration tests against Postgres only   |
| `bun run test:clickhouse`    | Run integration tests against ClickHouse only |
| `bun run test:ui`            | Open Vitest UI                                |
| `bun run typecheck`          | Type-check with `tsgo`                        |
| `bun run format`             | Format all files with Prettier                |
| `bun run gen`                | Regenerate protobuf types from `proto/`       |
| `bun run migrate:clickhouse` | Run ClickHouse schema migrations              |
| `bun run proto:pull`         | Pull latest proto submodule changes           |
| `bun run init_key`           | Generate an initial dashboard API key         |

---

## Submitting a Pull Request

1. **Branch** off `main` with a descriptive name: `feat/my-feature`, `fix/the-bug`, `refactor/thing`
2. **Follow the code style** conventions above — Husky will run `format` and `typecheck` on commit
3. **Add or update tests** for any behaviour change; make sure `bun run test:all` passes
4. **Keep commits focused** — one logical change per commit with a clear message
5. **Open the PR** against `main` with a description of what changed and why

For significant changes, open an issue first to discuss the approach before writing code.
