// Extends app.json. Android push notifications need Firebase Cloud Messaging: once the
// Firebase file exists (mobile/google-services.json, or the GOOGLE_SERVICES_JSON file
// variable on EAS), it is included in the build automatically.
const fs = require("fs");
const path = require("path");

module.exports = ({ config }) => {
  const localFile = path.join(__dirname, "google-services.json");
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON || (fs.existsSync(localFile) ? "./google-services.json" : undefined);
  return {
    ...config,
    android: { ...config.android, ...(googleServicesFile ? { googleServicesFile } : {}) }
  };
};
