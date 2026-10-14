const fs = require("fs");
const path = require("path");

// Phone login uses Firebase. It is switched on only when the Android app's
// google-services.json is available: either as a local file next to this config, or
// on EAS as a file environment variable named GOOGLE_SERVICES_JSON (EAS sets it to the
// uploaded file's path during the build). Without it the app builds with email login only.
module.exports = ({ config }) => {
  const localFile = path.join(__dirname, "google-services.json");
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON || (fs.existsSync(localFile) ? "./google-services.json" : null);

  if (!googleServicesFile) {
    return { ...config, extra: { ...config.extra, phoneLogin: false } };
  }

  return {
    ...config,
    android: { ...config.android, googleServicesFile },
    plugins: [...(config.plugins ?? []), "@react-native-firebase/app", "@react-native-firebase/auth"],
    extra: { ...config.extra, phoneLogin: true }
  };
};
