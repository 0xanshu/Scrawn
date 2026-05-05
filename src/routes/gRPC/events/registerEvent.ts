import {
  RegisterEventRequest,
  RegisterEventResponse,
} from "../../../gen/event/v1/event_pb.js";
import type { WideEventBuilder } from "../../../context/requestContext";
import { apiKeyContextKey } from "../../../context/auth";
import { wideEventContextKey } from "../../../context/requestContext";
import {
  validateAndParseRegisterEvent,
  createEventInstance,
  storeEvent,
} from "../../../utils/eventHelpers";
export async function registerEvent(call: any, callback: any): Promise<void> {
  const req = call.request as RegisterEventRequest;
  const wideEventBuilder = call[wideEventContextKey] as WideEventBuilder | null;

  try {
    // Extract API key ID from context
    const apiKeyId = call[apiKeyContextKey] as string;

    // Validate and parse the incoming event
    const eventSkeleton = await validateAndParseRegisterEvent(req);

    // Add business context to wide event
    wideEventBuilder?.setUser(eventSkeleton.userId);
    wideEventBuilder?.setEventContext({ eventType: eventSkeleton.type });

    // Create the appropriate event instance
    const event = createEventInstance(eventSkeleton);

    // Store the event
    await storeEvent(event, apiKeyId);

    const response = new RegisterEventResponse();
    response.setRandom("Event stored successfully");
    callback(null, response);
  } catch (error) {
    callback(error);
  }
}
