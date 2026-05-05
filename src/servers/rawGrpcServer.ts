import * as grpc from "@grpc/grpc-js";
import * as authGrpc from "../gen/auth/v1/auth_grpc_pb.js";
import * as eventGrpc from "../gen/event/v1/event_grpc_pb.js";
import * as paymentGrpc from "../gen/payment/v1/payment_grpc_pb.js";
import { createAPIKey } from "../routes/gRPC/auth/createAPIKey";
import { registerEvent } from "../routes/gRPC/events/registerEvent";
import { streamEvents } from "../routes/gRPC/events/streamEvents";
import { createCheckoutLink } from "../routes/gRPC/payment/createCheckoutLink";
import { logger } from "../errors/logger";

export function startRawGrpcServer(grpcPort: number): void {
  const server = new grpc.Server();

  server.addService((authGrpc as any).AuthServiceService, {
    createAPIKey: async (call: any, callback: any) => {
      try {
        const result = await createAPIKey(call.request, { values: new Map() } as any);
        callback(null, result);
      } catch (err) {
        callback(err);
      }
    },
  });

  server.addService((eventGrpc as any).EventServiceService, {
    registerEvent: async (call: any, callback: any) => {
      try {
        const result = await registerEvent(call.request, { values: new Map() } as any);
        callback(null, result);
      } catch (err) {
        callback(err);
      }
    },
    streamEvents: (call: any) => {
      streamEvents(call.request, call, { values: new Map() } as any);
    },
  });

  server.addService((paymentGrpc as any).PaymentServiceService, {
    createCheckoutLink: async (call: any, callback: any) => {
      try {
        const result = await createCheckoutLink(call.request, { values: new Map() } as any);
        callback(null, result);
      } catch (err) {
        callback(err);
      }
    },
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
