import type { sendUnaryData } from "@grpc/grpc-js";
import {
  CreateAPIKeyRequest,
  CreateAPIKeyResponse,
} from "../../../gen/auth/v1/auth_pb.js";
import type { WideEventBuilder } from "../../../context/requestContext";
import { apiKeyContextKey } from "../../../context/auth";
import { createAPIKeySchema } from "../../../zod/apikey";
import { APIKeyError } from "../../../errors/apikey";
import { AuthError } from "../../../errors/auth";
import { generateAPIKey } from "../../../utils/generateAPIKey";
import { StorageAdapterFactory } from "../../../factory";
import { AddKey } from "../../../events/RawEvents/AddKey";
import { wideEventContextKey } from "../../../context/requestContext";
import { hashAPIKey } from "../../../utils/hashAPIKey";
import { formatZodError } from "../../../utils/formatZodError";
import { DateTime } from "luxon";

export async function createAPIKey(
  call: unknown,
  callback?: sendUnaryData<CreateAPIKeyResponse>
): Promise<void> {
  const c = call as Record<string, unknown>;
  const req = c.request as CreateAPIKeyRequest;
  const wideEventBuilder = (call as Record<symbol, unknown>)[wideEventContextKey] as WideEventBuilder | null;

  try {
    // Get API key ID from context (set by auth interceptor)
    const apiKeyId = (call as Record<symbol, unknown>)[apiKeyContextKey] as string;
    if (!apiKeyId) {
      return callback?.(
        AuthError.invalidAPIKey("API key ID not found in context")
      );
    }

    // Validate the incoming request
    const validatedData = validateRequest(req);

    // Add business context to wide event
    wideEventBuilder?.setApiKeyContext({ name: validatedData.name });

    // Generate and hash the API key
    const apiKey = generateAPIKey();
    const apiKeyHash = hashAPIKey(apiKey);

    // Calculate expiration date
    const now = DateTime.utc();
    const expiresInSeconds =
      typeof validatedData.expiresIn === "bigint"
        ? Number(validatedData.expiresIn)
        : validatedData.expiresIn;
    const expiresAt = now.plus({ seconds: expiresInSeconds });

    wideEventBuilder?.setApiKeyContext({ expiration: expiresAt.toISO() });

    // Create and store the key
    const addKeyEvent = new AddKey({
      name: validatedData.name,
      key: apiKeyHash,
      expiresAt: expiresAt.toISO(),
    });

    const adapter = await StorageAdapterFactory.getEventStorageAdapter(
      addKeyEvent.type
    );
    const keyEventData = await adapter.add(addKeyEvent.serialize(), "");

    if (!keyEventData) {
      return callback?.(APIKeyError.creationFailed("Storage returned no ID"));
    }

    const response = new CreateAPIKeyResponse();
    response.setApikeyid(keyEventData.id);
    response.setApikey(apiKey);
    response.setName(validatedData.name);
    response.setCreatedat(now.toISO());
    response.setExpiresat(expiresAt.toISO());

    callback?.(null, response);
  } catch (error) {
    callback?.(error as Error);
  }
}

function validateRequest(req: CreateAPIKeyRequest) {
  try {
    const json = {
      name: req.getName(),
      expiresIn: req.getExpiresin(),
    };
    return createAPIKeySchema.parse(json);
  } catch (error) {
    throw formatZodError(error, (msg) => APIKeyError.validationFailed(msg));
  }
}
