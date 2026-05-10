const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const wsShimPath = path.resolve(__dirname, "src/shims/ws.js");
const corePath = path.resolve(__dirname, "../packages/core/src");

config.watchFolders = [...new Set([...(config.watchFolders || []), corePath])];
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, "node_modules"),
  path.resolve(__dirname, "../node_modules")
];

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "ws") {
    return {
      filePath: wsShimPath,
      type: "sourceFile"
    };
  }

  if (moduleName.startsWith("@mahalaxmi/core/")) {
    return {
      filePath: path.resolve(corePath, `${moduleName.replace("@mahalaxmi/core/", "")}.ts`),
      type: "sourceFile"
    };
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
