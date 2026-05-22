import DodoPayments from "dodopayments";
import { PaymentError } from "../../../errors/payment";

let liveClient: DodoPayments | null = null;
let testClient: DodoPayments | null = null;

export function getDodoClient(mode?: "test" | "production"): DodoPayments {
  if (!mode) {
    mode = process.env.NODE_ENV === "production" ? "production" : "test";
  }
  if (mode === "production") {
    if (!liveClient) {
      const apiKey = process.env.DODO_PAYMENTS_LIVE_API_KEY;
      if (!apiKey) {
        throw PaymentError.missingApiKey();
      }
      liveClient = new DodoPayments({
        bearerToken: apiKey,
        environment: "live_mode",
        webhookKey: process.env.DODO_PAYMENTS_WEBHOOK_SECRET,
      });
    }
    return liveClient;
  }

  if (!testClient) {
    const apiKey = process.env.DODO_PAYMENTS_TEST_API_KEY;
    if (!apiKey) {
      throw PaymentError.missingApiKey();
    }
    testClient = new DodoPayments({
      bearerToken: apiKey,
      environment: "test_mode",
      webhookKey: process.env.DODO_PAYMENTS_WEBHOOK_SECRET,
    });
  }
  return testClient;
}

export interface PaymentProviderConfig {
  productId: string;
  returnUrl: string;
}

export interface CheckoutParams {
  customPrice: number;
  userId: string;
  apiKeyId: string;
}

export interface CheckoutResult {
  sessionId: string;
  checkoutUrl: string;
}

export function getPaymentProviderConfig(): PaymentProviderConfig {
  const productId = process.env.DODO_PAYMENTS_PRODUCT_ID;
  const returnUrl = `${process.env.REDIRECT_URL}`;

  if (!productId) {
    throw PaymentError.missingProductId();
  }

  return { productId, returnUrl };
}

export async function createProviderCheckout(
  config: PaymentProviderConfig,
  params: CheckoutParams,
  mode: "test" | "production"
): Promise<CheckoutResult> {
  const client = getDodoClient(mode);

  const session = await client.checkoutSessions.create({
    product_cart: [
      {
        product_id: config.productId,
        quantity: 1,
        amount: params.customPrice,
      },
    ],
    metadata: {
      user_id: params.userId,
      api_key_id: params.apiKeyId,
    },
    return_url: config.returnUrl,
  });

  if (!session.checkout_url) {
    throw PaymentError.invalidCheckoutResponse(
      "No checkout URL returned from Dodo"
    );
  }

  if (!session.session_id) {
    throw PaymentError.invalidCheckoutResponse(
      "No session ID returned from Dodo"
    );
  }

  return {
    sessionId: session.session_id,
    checkoutUrl: session.checkout_url,
  };
}
