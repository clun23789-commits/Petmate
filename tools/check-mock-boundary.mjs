import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const scannedRoots = ["miniprogram/pages", "miniprogram/flows"];
const forbiddenPattern = /services[\\\/](mock|cloud)/;

function projectPath(relativePath) {
  return path.join(projectRoot, ...relativePath.split(/[\\/]/));
}

function toProjectRelativePath(absolutePath) {
  return path.relative(projectRoot, absolutePath).replace(/\\/g, "/");
}

function collectFiles(absoluteDir) {
  if (!fs.existsSync(absoluteDir)) {
    return [];
  }

  const entries = fs.readdirSync(absoluteDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(absoluteDir, entry.name);

    if (entry.isDirectory()) {
      files.push(...collectFiles(entryPath));
      continue;
    }

    if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
}

function findForbiddenReferences(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  return content
    .split(/\r?\n/)
    .map((line, index) => ({
      line,
      lineNumber: index + 1
    }))
    .filter(({ line }) => forbiddenPattern.test(line));
}

const violations = [];

for (const root of scannedRoots) {
  const files = collectFiles(projectPath(root));

  for (const file of files) {
    const matches = findForbiddenReferences(file);

    for (const match of matches) {
      violations.push({
        file: toProjectRelativePath(file),
        lineNumber: match.lineNumber,
        line: match.line.trim()
      });
    }
  }
}

if (violations.length > 0) {
  console.error("Mock boundary check failed:");
  console.error("Pages and flows must import unified services/* entrypoints, not services/mock or services/cloud.");

  for (const violation of violations) {
    console.error(`- ${violation.file}:${violation.lineNumber} ${violation.line}`);
  }

  process.exit(1);
}

console.log("Mock boundary check passed.");
