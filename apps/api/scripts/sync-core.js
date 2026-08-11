const fs = require("fs");
const path = require("path");

const sourceDir = path.resolve(__dirname, "../../../packages/core/src");
const targetDir = path.resolve(__dirname, "../src/core");

if (fs.existsSync(sourceDir)) {
  fs.cpSync(sourceDir, targetDir, { recursive: true });
  console.log("Successfully synced packages/core/src to apps/api/src/core");
} else {
  console.log("packages/core/src not found, skipping sync (using existing src/core)");
}
