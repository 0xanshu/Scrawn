import {
  StreamEventRequest,
  StreamEventResponse,
} from "../../../gen/event/v1/event_pb.js";
import { EventError } from "../../../errors/event";
import type { WideEventBuilder } from "../../../context/requestContext";
import { wideEventContextKey } from "../../../context/requestContext";
import {
  validateAndParseStreamEvent,
  createEventInstance,
  storeEvent,
} from "../../../utils/eventHelpers";
import { apiKeyContextKey } from "../../../context/auth";

export async function streamEvents(call: any): Promise<void> {
  let eventsProcessed = 0;
  let userId: string | undefined;
  const wideEventBuilder = call[wideEventContextKey] as WideEventBuilder | null;

  try {
    // Extract API key ID from context
    const apiKeyId = call[apiKeyContextKey] as string;

    // Handle client stream
    for await (const req of call) {
      const eventSkeleton = await validateAndParseStreamEvent(
        req as StreamEventRequest
      );

      // Capture userId from first event for logging
      if (!userId) {
        userId = eventSkeleton.userId;
        wideEventBuilder?.setUser(userId);
        wideEventBuilder?.setEventContext({ eventType: "AI_TOKEN_USAGE" });
      }

      const event = createEventInstance(eventSkeleton);

      if (event.type !== "AI_TOKEN_USAGE") {
        throw EventError.unsupportedEventType(event.type);
      }

      await storeEvent(event, apiKeyId);
      eventsProcessed += 1;
    }

    const response = new StreamEventResponse();
    response.setEventsprocessed(eventsProcessed);
    response.setMessage(`Successfully processed ${eventsProcessed} events`);
    call.end(response);
  } catch (error) {
    call.destroy(error);
  } finally {
    // Always update the count, even on error
    wideEventBuilder?.setEventContext({ eventCount: eventsProcessed });
  }
}
