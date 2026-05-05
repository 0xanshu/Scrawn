import * as jspb from "google-protobuf";

export class CreateAPIKeyRequest extends jspb.Message {
  getName(): string;
  setName(value: string): void;
  getExpiresin(): number;
  setExpiresin(value: number): void;
  serializeBinary(): Uint8Array;
  static deserializeBinary(bytes: Uint8Array): CreateAPIKeyRequest;
}

export class CreateAPIKeyResponse extends jspb.Message {
  getApikeyid(): string;
  setApikeyid(value: string): void;
  getApikey(): string;
  setApikey(value: string): void;
  getName(): string;
  setName(value: string): void;
  getCreatedat(): string;
  setCreatedat(value: string): void;
  getExpiresat(): string;
  setExpiresat(value: string): void;
  serializeBinary(): Uint8Array;
  static deserializeBinary(bytes: Uint8Array): CreateAPIKeyResponse;
}
