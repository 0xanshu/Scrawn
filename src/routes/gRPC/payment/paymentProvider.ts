import DodoPayments from "dodopayments";
import { PaymentError } from "../../../errors/payment";
import { getMetadata } from "../../../storage/db/postgres/helpers/metadata";
import { decrypt } from "../../../utils/encryptMetadata.ts";

const clients = new Map<string, DodoPayments>();

function clientKey(projectId: string, mode: string): string {
  return `${projectId}:${mode}`;
}

export function clearClients(): void {
  clients.clear();
}

export async function getDodoClient(
  projectId: string,
  mode?: "test" | "production"
): Promise<DodoPayments> {
  if (!mode) {
    mode = process.env.NODE_ENV === "production" ? "production" : "test";
  }

  const key = clientKey(projectId, mode);
  const cached = clients.get(key);
  if (cached) return cached;

  const metadata = await getMetadata(projectId);

  if (!metadata) {
    throw PaymentError.missingMetadata();
  }

  const encryptedApiKey =
    mode === "production"
      ? metadata.dodo_live_api_key
      : metadata.dodo_test_api_key;
  const encryptedWebhookSecret =
    mode === "production"
      ? metadata.dodo_live_webhook_secret
      : metadata.dodo_test_webhook_secret;

  if (!encryptedApiKey) {
    throw PaymentError.missingApiKey();
  }

  const client = new DodoPayments({
    bearerToken: decrypt(encryptedApiKey),
    environment: mode === "production" ? "live_mode" : "test_mode",
    webhookKey: encryptedWebhookSecret
      ? decrypt(encryptedWebhookSecret)
      : undefined,
  });

  clients.set(key, client);
  return client;
}

export interface PaymentProviderConfig {
  productId: string;
  returnUrl: string | null;
  currency: string;
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

export async function getPaymentProviderConfig(
  projectId: string,
  mode: "test" | "production"
): Promise<PaymentProviderConfig> {
  if (!mode) {
    mode = process.env.NODE_ENV === "production" ? "production" : "test";
  }

  const metadata = await getMetadata(projectId);

  if (!metadata) {
    throw PaymentError.missingMetadata();
  }

  const productId =
    mode === "production"
      ? metadata.dodo_live_product_id
      : metadata.dodo_test_product_id;
  const returnUrl = metadata.redirect_url ?? null;

  if (!productId) {
    throw PaymentError.missingProductId();
  }

  return { productId, returnUrl, currency: metadata.currency };
}

export async function createProviderCheckout(
  projectId: string,
  config: PaymentProviderConfig,
  params: CheckoutParams,
  mode: "test" | "production"
): Promise<CheckoutResult> {
  const client = await getDodoClient(projectId, mode);

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
    ...(config.returnUrl ? { return_url: config.returnUrl } : {}),
    billing_currency:
      config.currency.toUpperCase() as import("dodopayments/resources/misc").Currency,
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
