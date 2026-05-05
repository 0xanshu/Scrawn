import * as jspb from "google-protobuf";

export class CreateCheckoutLinkRequest extends jspb.Message {
  getUserid(): string;
  setUserid(value: string): void;
  serializeBinary(): Uint8Array;
  static deserializeBinary(bytes: Uint8Array): CreateCheckoutLinkRequest;
}

export class CreateCheckoutLinkResponse extends jspb.Message {
  getCheckoutlink(): string;
  setCheckoutlink(value: string): void;
  serializeBinary(): Uint8Array;
  static deserializeBinary(bytes: Uint8Array): CreateCheckoutLinkResponse;
}
