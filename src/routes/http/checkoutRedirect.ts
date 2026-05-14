import type { FastifyRequest, FastifyReply } from "fastify";
import { getCheckoutUrl } from "../../storage/db/postgres/helpers/sessions";

export async function handleCheckoutRedirect(
  request: FastifyRequest<{ Params: { sessionId: string } }>,
  reply: FastifyReply
): Promise<void> {
  const { sessionId } = request.params;
  const checkoutUrl = await getCheckoutUrl(sessionId);

  if (!checkoutUrl) {
    reply.code(404);
    return reply.send({ error: "Checkout session not found" });
  }

  reply.code(302).redirect(checkoutUrl);
}
