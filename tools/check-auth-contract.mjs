import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);

const authPath = path.join(projectRoot, "miniprogram", "services", "auth", "index.js");
const creationFlowPath = path.join(projectRoot, "miniprogram", "flows", "creationFlow.js");
const requiredExports = [
  "login",
  "requestProfilePermission",
  "requestCameraPermission",
  "requestAlbumPermission",
  "mockLogin",
  "mockGrantProfilePermission",
  "mockGrantCameraPermission",
  "mockGrantAlbumPermission"
];
const errors = [];

function addError(message) {
  errors.push(message);
}

if (!fs.existsSync(authPath)) {
  addError("Missing miniprogram/services/auth/index.js.");
}

if (!fs.existsSync(creationFlowPath)) {
  addError("Missing miniprogram/flows/creationFlow.js.");
}

if (errors.length === 0) {
  try {
    const auth = require(authPath);
    requiredExports.forEach((exportName) => {
      if (typeof auth[exportName] !== "function") {
        addError(`auth service must export ${exportName}().`);
      }
    });
  } catch (error) {
    addError(`Failed to load auth service: ${error && error.message ? error.message : error}`);
  }
}

if (fs.existsSync(creationFlowPath)) {
  const creationFlowContent = fs.readFileSync(creationFlowPath, "utf8");
  if (/\(0,\s*auth_1\.mockLogin\)\s*\(/.test(creationFlowContent)) {
    addError("creationFlow should use auth.login() with mockLogin only as a compatibility fallback.");
  }
}

if (errors.length > 0) {
  console.error("Auth contract check failed:");
  errors.forEach((error) => {
    console.error(`- ${error}`);
  });
  process.exit(1);
}

console.log("Auth contract check passed.");
