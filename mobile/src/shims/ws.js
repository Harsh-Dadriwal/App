const NativeWebSocket = global.WebSocket;

function missingFeature(name) {
  return () => {
    throw new Error(`${name} is not supported in the React Native ws shim.`);
  };
}

module.exports = NativeWebSocket || function WebSocketShim() {};
module.exports.default = NativeWebSocket || function WebSocketShim() {};
module.exports.WebSocket = NativeWebSocket || function WebSocketShim() {};
module.exports.createWebSocketStream = missingFeature("createWebSocketStream");
module.exports.Server = missingFeature("Server");
module.exports.Receiver = function Receiver() {};
module.exports.Sender = function Sender() {};
