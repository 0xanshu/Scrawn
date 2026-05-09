import { EventError } from "../errors/event";
import type { Event, SDKCallEventData, AITokenUsageEventData } from "../interface/event/Event";
import { SDKCall } from "../events/RawEvents/SDKCall";
import { AITokenUsage } from "../events/AIEvents/AITokenUsage";
import { PostgresAdapter } from "../storage/adapter/postgres/postgres";
import type { RegisterEventSchemaType, StreamEventSchemaType } from "../zod/event";

export function createEventInstance(
  eventSkeleton: RegisterEventSchemaType | StreamEventSchemaType
): Event {
  if (eventSkeleton.type === "SDK_CALL") {
    const data = (eventSkeleton as { sdkcall: SDKCallEventData }).sdkcall;
    return new SDKCall(
      eventSkeleton.userid,
      eventSkeleton.reportedtimestamp,
      data
    );
  }
  if (eventSkeleton.type === "AI_TOKEN_USAGE") {
    const data = (eventSkeleton as { aitokenusage: AITokenUsageEventData }).aitokenusage;
    return new AITokenUsage(
      eventSkeleton.userid,
      eventSkeleton.reportedtimestamp,
      data
    );
  }
  throw EventError.unsupportedEventType("Unknown event type");
}

export async function storeEvent(
  event: Event,
  apiKeyId: string
): Promise<void> {
  const adapter = new PostgresAdapter();
  await adapter.add(event.serialize(), apiKeyId);
}