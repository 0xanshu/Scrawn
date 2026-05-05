import * as grpc from "@grpc/grpc-js";
import * as eventGrpc from "../src/gen/event/v1/event_grpc_pb.js";
import * as eventPb from "../src/gen/event/v1/event_pb.js";

const EventServiceClient = (eventGrpc as any).EventServiceClient;

if (!EventServiceClient) {
  console.error("EventServiceClient not found in", eventGrpc);
  process.exit(1);
}

const eventClient = new EventServiceClient(
  "localhost:8069",
  grpc.credentials.createInsecure()
);

// Test: Invalid request (missing required fields)
console.log("Test: Invalid RegisterEvent request...");
const request = new eventPb.RegisterEventRequest();
request.setType(1); // SDK_CALL = 1
// Missing userId and data

eventClient.registerEvent(request, (error: any, response: any) => {
  if (error) {
    console.log("✓ Error correctly returned:");
    console.log("  Message:", error.message);
    console.log("  Code:", error.code);
  } else {
    console.log("✗ Expected error but got response:", response);
  }
  
  eventClient.close();
});
