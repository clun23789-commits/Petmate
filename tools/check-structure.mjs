import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const requiredEntries = [
  "miniprogram/app.json",
  "miniprogram/app.js",
  "miniprogram/config/experience.js",
  "miniprogram/models/status.js",
  "miniprogram/mocks/data/mockWorks.js",
  "miniprogram/mocks/data/mockCases.js",
  "miniprogram/mocks/data/mockUser.js",
  "miniprogram/mocks/data/mockRights.js",
  "miniprogram/mocks/data/mockGenerationTask.js",
  "miniprogram/components/app-page-layout",
  "miniprogram/components/top-nav",
  "miniprogram/components/status-tag",
  "miniprogram/components/primary-button",
  "miniprogram/components/secondary-button",
  "miniprogram/components/empty-state",
  "miniprogram/components/error-state",
  "miniprogram/components/confirm-modal",
  "miniprogram/pages/works/index",
  "miniprogram/pages/works/start-create",
  "miniprogram/pages/works/ad-unlock",
  "miniprogram/pages/works/upload",
  "miniprogram/pages/works/generating",
  "miniprogram/pages/works/result",
  "miniprogram/pages/works/targeted-upload",
  "miniprogram/pages/works/detail-retouch",
  "miniprogram/pages/works/exception"
];

function projectPath(relativePath) {
  return path.join(projectRoot, ...relativePath.split(/[\\/]/));
}

function pathExists(relativePath) {
  return fs.existsSync(projectPath(relativePath));
}

function countFiles(relativePath, predicate = () => true) {
  const absolutePath = projectPath(relativePath);

  if (!fs.existsSync(absolutePath)) {
    return 0;
  }

  return fs
    .readdirSync(absolutePath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && predicate(entry.name))
    .length;
}

const errors = [];
const missingEntries = requiredEntries.filter((entry) => !pathExists(entry));
const shouldCheckDesignAssets = process.env.CHECK_DESIGN_ASSETS === "1";

const docsCount = countFiles("docs", (name) => name.endsWith(".md"));
if (docsCount < 3) {
  errors.push(`Expected at least 3 product docs in docs/, found ${docsCount}.`);
}

if (shouldCheckDesignAssets) {
  if (!pathExists("design/Petmate_33_pages_2.1/image_manifest.csv")) {
    errors.push("Missing design image manifest: design/Petmate_33_pages_2.1/image_manifest.csv.");
  }

  const designReadmeCount = countFiles("design/Petmate_33_pages_2.1", (name) =>
    name.endsWith(".md")
  );
  if (designReadmeCount < 1) {
    errors.push("Expected at least one design AI-readme markdown file in design/Petmate_33_pages_2.1/.");
  }

  const designAssetCount = countFiles("design/Petmate_33_pages_2.1/assets");
  if (designAssetCount < 33) {
    errors.push(`Expected at least 33 design assets, found ${designAssetCount}.`);
  }
}

if (missingEntries.length > 0) {
  errors.push(`Missing required entries: ${missingEntries.join(", ")}.`);
}

if (errors.length > 0) {
  console.error("Structure check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("Structure check passed.");
