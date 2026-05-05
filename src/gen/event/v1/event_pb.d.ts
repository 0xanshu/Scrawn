import * as jspb from "google-protobuf";

export class RegisterEventRequest extends jspb.Message {
  getType(): string;
  setType(value: string): void;
  getUserid(): string;
  setUserid(value: string): void;
  getReportedtimestamp(): string;
  setReportedtimestamp(value: string): void;
  getDatacase1(): string;
  setDatacase1(value: string): void;
  serializeBinary(): Uint8Array;
  static deserializeBinary(bytes: Uint8Array): RegisterEventRequest;
}

export class RegisterEventResponse extends jspb.Message {
  getRandom(): string;
  setRandom(value: string): void;
  serializeBinary(): Uint8Array;
  static deserializeBinary(bytes: Uint8Array): RegisterEventResponse;
}

export class StreamEventRequest extends jspb.Message {
  getType(): string;
  setType(value: string): void;
  getUserid(): string;
  setUserid(value: string): void;
  getReportedtimestamp(): string;
  setReportedtimestamp(value: string): void;
  getDatacase1(): string;
  setDatacase1(value: string): void;
  serializeBinary(): Uint8Array;
  static deserializeBinary(bytes: Uint8Array): StreamEventRequest;
}

export class StreamEventResponse extends jspb.Message {
  getEventsprocessed(): number;
  setEventsprocessed(value: number): void;
  getMessage(): string;
  setMessage(value: string): void;
  serializeBinary(): Uint8Array;
  static deserializeBinary(bytes: Uint8Array): StreamEventResponse;
}
