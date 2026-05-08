import { getPostgresDB } from "./storage/db/postgres/db.ts";
import { logger } from "./errors/logger.ts";
import { startRawGrpcServer, type GrpcTlsOptions } from "./servers/rawGrpcServer.ts";
import { startFastifyServer } from "./servers/fastifyServer.ts";
import { OnboardingWorker } from "./workers/onboarding.ts";
import { getRedisConnection } from "./storage/db/redis.ts";

const DATABASE_URL = process.env.DATABASE_URL;
const HMAC_SECRET = process.env.HMAC_SECRET;
const REDIS_URL = process.env.REDIS_URL;

if (!DATABASE_URL) {
  logger.fatal("DATABASE_URL is not defined in environment variables");
  throw new Error("DATABASE_URL is not defined in environment variables");
}

if (!HMAC_SECRET) {
  logger.fatal("HMAC_SECRET environment variable is not set");
  throw new Error("HMAC_SECRET environment variable is not set");
}

if (!REDIS_URL) {
  logger.fatal("REDIS_URL environmentvariable is not set");
  throw new Error("REDIS_URL environmentvariable is not set");
}

getPostgresDB(DATABASE_URL);
getRedisConnection(REDIS_URL);

const PORT = Number(process.env.PORT ?? 8070);
const GRPC_PORT = Number(process.env.GRPC_PORT ?? 8069);
const GRPC_TLS_CERT_PATH = process.env.GRPC_TLS_CERT_PATH;
const GRPC_TLS_KEY_PATH = process.env.GRPC_TLS_KEY_PATH;
const GRPC_TLS_CA_PATH = process.env.GRPC_TLS_CA_PATH;
const GRPC_TLS_ENABLED = process.env.GRPC_TLS_ENABLED === "true";

async function loadGrpcTlsOptions(): Promise<GrpcTlsOptions | undefined> {
  if (!GRPC_TLS_ENABLED) {
    return undefined;
  }

  if (!GRPC_TLS_CERT_PATH || !GRPC_TLS_KEY_PATH) {
    logger.fatal("GRPC_TLS_ENABLED requires GRPC_TLS_CERT_PATH and GRPC_TLS_KEY_PATH");
    throw new Error("gRPC TLS config incomplete");
  }

  const cert = Bun.file(GRPC_TLS_CERT_PATH);
  const key = Bun.file(GRPC_TLS_KEY_PATH);
  if (!cert.size || !key.size) {
    logger.fatal("gRPC TLS cert or key file is empty");
    throw new Error("gRPC TLS cert or key file is empty");
  }

  const ca = GRPC_TLS_CA_PATH ? Bun.file(GRPC_TLS_CA_PATH) : undefined;

  return {
    cert: Buffer.from(await cert.arrayBuffer()),
    key: Buffer.from(await key.arrayBuffer()),
    ca: ca ? Buffer.from(await ca.arrayBuffer()) : undefined,
  };
}

let onboardingWorker: OnboardingWorker | undefined;

async function main(): Promise<void> {
  const tlsOptions = await loadGrpcTlsOptions();
  startRawGrpcServer(GRPC_PORT, tlsOptions);
  await startFastifyServer(PORT, GRPC_PORT);

  if (!tlsOptions) {
    logger.lifecycleWarning(
      "Server running without TLS. In production, use a TLS-terminating proxy or enable TLS."
    );
  }

  onboardingWorker = new OnboardingWorker();
  logger.lifecycle("Onboarding worker started");
}

process.on("beforeExit", async () => {
  if (onboardingWorker) {
    await onboardingWorker.close();
  }
});

void main();
