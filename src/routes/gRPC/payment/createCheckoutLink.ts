import type { sendUnaryData } from "@grpc/grpc-js";
import {
  CreateCheckoutLinkRequest,
  CreateCheckoutLinkResponse,
} from "../../../gen/payment/v1/payment_pb.js";
import {
  createCheckoutLinkSchema,
  type CreateCheckoutLinkSchemaType,
} from "../../../zod/payment";
import { PaymentError } from "../../../errors/payment";
import { AuthError } from "../../../errors/auth";
import { formatZodError } from "../../../utils/formatZodError";
import type {
  PaymentProviderConfig,
  CheckoutParams,
} from "./paymentProvider.ts";
import {
  getPaymentProviderConfig,
  createProviderCheckout,
  type CheckoutResult,
} from "./paymentProvider.ts";
import { StorageAdapterFactory } from "../../../factory";
import type { WideEventBuilder } from "../../../context/requestContext";
import { apiKeyContextKey } from "../../../context/auth";
import { wideEventContextKey } from "../../../context/requestContext";
import type { UserId } from "../../../config/identifiers";
import { DateTime } from "luxon";
import { handleAddSession } from "../../../storage/adapter/postgres/handlers";
import { type ContextUnaryCall } from "../../../interface/types/context.ts";

export async function createCheckoutLink(
  call: ContextUnaryCall<CreateCheckoutLinkRequest, CreateCheckoutLinkResponse>,
  callback?: sendUnaryData<CreateCheckoutLinkResponse>
): Promise<void> {
  const c = call;
  const req = c.request;
  const wideEventBuilder = call[wideEventContextKey];

  try {
    const apiKeyId = call[apiKeyContextKey];
    if (!apiKeyId) {
      return callback?.(
        AuthError.invalidAPIKey("API key ID not found in context")
      );
    }

    // Validate environment configuration
    const config = getPaymentProviderConfig();

    // Validate the incoming request
    const validatedData = validateRequest(req);
    wideEventBuilder?.setUser(validatedData.userId);

    // Payment provider is configured via paymentProvider.ts

    // Get custom price from storage
    const beforeTimestamp = DateTime.utc();
    const custom_price = await calculatePrice(
      validatedData.userId,
      beforeTimestamp
    );
    wideEventBuilder?.setPaymentContext({ priceAmount: custom_price });

    // Create checkout session
    const checkoutResult = await createCheckoutSession(
      config,
      custom_price,
      validatedData.userId,
      apiKeyId,
      beforeTimestamp
    );

    // Add session to database
    const sessionResult = await handleAddSession(
      validatedData.userId,
      checkoutResult.sessionId,
      beforeTimestamp
    );
    wideEventBuilder?.setPaymentContext({ sessionId: sessionResult.id });

    const response = new CreateCheckoutLinkResponse();
    response.setCheckoutlink(checkoutResult.checkoutUrl);
    callback?.(null, response);
  } catch (error) {
    callback?.(error as Error);
  }
}

function validateRequest(
  req: CreateCheckoutLinkRequest
): CreateCheckoutLinkSchemaType {
  try {
    const json = {
      userId: req.getUserid(),
    };
    return createCheckoutLinkSchema.parse(json);
  } catch (error) {
    throw formatZodError(error, (msg) => PaymentError.validationFailed(msg));
  }
}

async function calculatePrice(
  userId: UserId,
  beforeTimestamp: DateTime
): Promise<number> {
  const storageAdapter =
    await StorageAdapterFactory.getEventStorageAdapter("PAYMENT");

  if (!storageAdapter) {
    throw PaymentError.storageAdapterFailed("Storage adapter not available");
  }

  const price = await storageAdapter.price(userId, "PAYMENT", beforeTimestamp);

  if (typeof price !== "number" || isNaN(price) || price < 0) {
    throw PaymentError.priceCalculationFailed(
      userId,
      new Error(`Invalid price: ${price}`)
    );
  }

  return price;
}

async function createCheckoutSession(
  config: PaymentProviderConfig,
  customPrice: number,
  userId: string,
  apiKeyId: string,
  beforeTimestamp: DateTime
): Promise<CheckoutResult> {
  const params: CheckoutParams = {
    customPrice,
    userId,
    apiKeyId,
  };

  const checkoutResult = await createProviderCheckout(config, params);

  if (
    !checkoutResult.checkoutUrl ||
    typeof checkoutResult.checkoutUrl !== "string" ||
    checkoutResult.checkoutUrl.trim().length === 0
  ) {
    throw PaymentError.invalidCheckoutResponse(
      "No valid checkout URL in response"
    );
  }

  try {
    new URL(checkoutResult.checkoutUrl);
  } catch {
    throw PaymentError.invalidCheckoutResponse(
      `Invalid URL format: ${checkoutResult.checkoutUrl}`
    );
  }

  return checkoutResult;
}
