const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const wsShimPath = path.resolve(__dirname, "src/shims/ws.js");

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "ws") {
    return {
      filePath: wsShimPath,
      type: "sourceFile"
    };
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
