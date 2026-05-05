import * as grpc from "@grpc/grpc-js";
import * as authGrpc from "../gen/auth/v1/auth_grpc_pb.js";
import * as eventGrpc from "../gen/event/v1/event_grpc_pb.js";
import * as paymentGrpc from "../gen/payment/v1/payment_grpc_pb.js";
import { createAPIKey } from "../routes/gRPC/auth/createAPIKey";
import { registerEvent } from "../routes/gRPC/events/registerEvent";
import { streamEvents } from "../routes/gRPC/events/streamEvents";
import { createCheckoutLink } from "../routes/gRPC/payment/createCheckoutLink";
import { logger } from "../errors/logger";
import { authInterceptor } from "../interceptors/auth";
import { loggingInterceptor } from "../interceptors/logging";

export function startRawGrpcServer(grpcPort: number): void {
  const server = new grpc.Server();

  // Wrap handlers with interceptors
  const wrappedCreateAPIKey = loggingInterceptor(
    "/AuthService/CreateAPIKey",
    authInterceptor("/AuthService/CreateAPIKey", createAPIKey)
  );

  const wrappedRegisterEvent = loggingInterceptor(
    "/EventService/RegisterEvent",
    authInterceptor("/EventService/RegisterEvent", registerEvent)
  );

  const wrappedStreamEvents = loggingInterceptor(
    "/EventService/StreamEvents",
    authInterceptor("/EventService/StreamEvents", streamEvents)
  );

  const wrappedCreateCheckoutLink = loggingInterceptor(
    "/PaymentService/CreateCheckoutLink",
    authInterceptor("/PaymentService/CreateCheckoutLink", createCheckoutLink)
  );

  server.addService((authGrpc as any).AuthServiceService, {
    createAPIKey: wrappedCreateAPIKey,
  });

  server.addService((eventGrpc as any).EventServiceService, {
    registerEvent: wrappedRegisterEvent,
    streamEvents: wrappedStreamEvents,
  });

  server.addService((paymentGrpc as any).PaymentServiceService, {
    createCheckoutLink: wrappedCreateCheckoutLink,
  });

  server.bindAsync(
    `0.0.0.0:${grpcPort}`,
    grpc.ServerCredentials.createInsecure(),
    (error, port) => {
      if (error) {
        logger.fatal("Failed to start gRPC server", error as Error);
        throw error;
      }
      logger.lifecycle("gRPC server listening", {
        url: `0.0.0.0:${port}`,
      });
    }
  );
}
