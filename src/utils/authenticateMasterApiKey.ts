import { createHmac, timingSafeEqual } from "crypto";
import { AuthError } from "../errors/auth";

function getMasterKeyHash(): string {
  const hash = process.env.MASTER_API_KEY_HASH;
  if (!hash) {
    throw new Error("MASTER_API_KEY_HASH environment variable is not set");
  }
  return hash;
}

export function authenticateMasterApiKey(authHeader: string | undefined): void {
  if (!authHeader) {
    throw AuthError.missingHeader();
  }

  if (!authHeader.startsWith("Bearer ")) {
    throw AuthError.invalidHeaderFormat();
  }

  const apiKey = authHeader.slice("Bearer ".length).trim();

  const hmacSecret = process.env.HMAC_SECRET;
  if (!hmacSecret) {
    throw new Error("HMAC_SECRET environment variable is not set");
  }

  const incomingHash = createHmac("sha256", hmacSecret)
    .update(apiKey)
    .digest("hex");

  const storedHash = getMasterKeyHash();

  if (
    incomingHash.length !== storedHash.length ||
    !timingSafeEqual(Buffer.from(incomingHash), Buffer.from(storedHash))
  ) {
    throw AuthError.permissionDenied("Invalid master API key");
  }
}
