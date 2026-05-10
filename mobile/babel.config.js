module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      [
        "module-resolver",
        {
          alias: {
            "@": "./src",
            "@shared-types": "../packages/shared-types/src",
            "@mahalaxmi/core": "../packages/core/src"
          }
        }
      ]
    ]
  };
};
