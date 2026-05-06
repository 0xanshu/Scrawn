import type { sendUnaryData } from "@grpc/grpc-js";
import {
  RegisterEventRequest,
  RegisterEventResponse,
} from "../../../gen/event/v1/event_pb.js";
import type { WideEventBuilder } from "../../../context/requestContext";
import { apiKeyContextKey } from "../../../context/auth";
import { wideEventContextKey } from "../../../context/requestContext";
import { registerEventSchema } from "../../../zod/event";
import { EventError } from "../../../errors/event";
import { createEventInstance, storeEvent } from "../../../utils/eventHelpers";
import { ZodError } from "zod";

export async function registerEvent(
  call: unknown,
  callback?: sendUnaryData<RegisterEventResponse>
): Promise<void> {
  const c = call as Record<string, unknown>;
  const req = c.request as RegisterEventRequest;
  const wideEventBuilder = (call as Record<symbol, unknown>)[wideEventContextKey] as WideEventBuilder | null;

  try {
    const apiKeyId = (call as Record<symbol, unknown>)[apiKeyContextKey] as string;
    const eventSkeleton = await registerEventSchema.parseAsync(req.toObject());

    wideEventBuilder?.setUser(eventSkeleton.userid);
    wideEventBuilder?.setEventContext({ eventType: eventSkeleton.type });

    // Create the appropriate event instance
    const event = createEventInstance(eventSkeleton);

    // Store the event
    await storeEvent(event, apiKeyId);

    const response = new RegisterEventResponse();
    response.setRandom("Event stored successfully");
    callback?.(null, response);
  } catch (error) {
    callback?.(error as Error);
  }
}
