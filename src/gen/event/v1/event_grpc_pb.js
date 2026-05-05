// GENERATED CODE -- DO NOT EDIT!

'use strict';
var grpc = require('@grpc/grpc-js');
var event_v1_event_pb = require('../../event/v1/event_pb.js');

function serialize_RegisterEventRequest(arg) {
  if (!(arg instanceof event_v1_event_pb.RegisterEventRequest)) {
    throw new Error('Expected argument of type RegisterEventRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_RegisterEventRequest(buffer_arg) {
  return event_v1_event_pb.RegisterEventRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_RegisterEventResponse(arg) {
  if (!(arg instanceof event_v1_event_pb.RegisterEventResponse)) {
    throw new Error('Expected argument of type RegisterEventResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_RegisterEventResponse(buffer_arg) {
  return event_v1_event_pb.RegisterEventResponse.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_StreamEventRequest(arg) {
  if (!(arg instanceof event_v1_event_pb.StreamEventRequest)) {
    throw new Error('Expected argument of type StreamEventRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_StreamEventRequest(buffer_arg) {
  return event_v1_event_pb.StreamEventRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_StreamEventResponse(arg) {
  if (!(arg instanceof event_v1_event_pb.StreamEventResponse)) {
    throw new Error('Expected argument of type StreamEventResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_StreamEventResponse(buffer_arg) {
  return event_v1_event_pb.StreamEventResponse.deserializeBinary(new Uint8Array(buffer_arg));
}


var EventServiceService = exports.EventServiceService = {
  // RegisterEvent registers an event as being done by a user
registerEvent: {
    path: '/EventService/RegisterEvent',
    requestStream: false,
    responseStream: false,
    requestType: event_v1_event_pb.RegisterEventRequest,
    responseType: event_v1_event_pb.RegisterEventResponse,
    requestSerialize: serialize_RegisterEventRequest,
    requestDeserialize: deserialize_RegisterEventRequest,
    responseSerialize: serialize_RegisterEventResponse,
    responseDeserialize: deserialize_RegisterEventResponse,
  },
  // StreamEvents streams events from client to server (e.g., AI token usage)
streamEvents: {
    path: '/EventService/StreamEvents',
    requestStream: true,
    responseStream: false,
    requestType: event_v1_event_pb.StreamEventRequest,
    responseType: event_v1_event_pb.StreamEventResponse,
    requestSerialize: serialize_StreamEventRequest,
    requestDeserialize: deserialize_StreamEventRequest,
    responseSerialize: serialize_StreamEventResponse,
    responseDeserialize: deserialize_StreamEventResponse,
  },
};

exports.EventServiceClient = grpc.makeGenericClientConstructor(EventServiceService, 'EventService');
