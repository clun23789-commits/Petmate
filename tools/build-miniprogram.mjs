import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectConfigPath = path.join(projectRoot, "project.config.json");
const miniRoot = path.join(projectRoot, "miniprogram");
const requiredPageExts = [".js", ".json", ".wxml", ".wxss"];
const requiredComponentExts = [".js", ".json", ".wxml", ".wxss"];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function assertExists(filePath, message) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${message}: ${path.relative(projectRoot, filePath)}`);
  }
}

function normalizeComponentPath(componentPath) {
  return componentPath.replace(/^\//, "");
}

function ensurePageBundle(pagePath) {
  const absoluteBase = path.join(miniRoot, pagePath);
  requiredPageExts.forEach((ext) => {
    assertExists(`${absoluteBase}${ext}`, `Missing page runtime file`);
  });
}

function ensureComponentBundle(componentPath) {
  const normalized = normalizeComponentPath(componentPath);
  const absoluteBase = path.join(miniRoot, normalized);
  requiredComponentExts.forEach((ext) => {
    assertExists(`${absoluteBase}${ext}`, `Missing component runtime file`);
  });
}

function collectUsingComponentsTargets(jsonFilePath) {
  if (!fs.existsSync(jsonFilePath)) {
    return [];
  }
  const json = readJson(jsonFilePath);
  return Object.values(json.usingComponents || {});
}

function main() {
  assertExists(projectConfigPath, "Missing project config");
  assertExists(path.join(miniRoot, "app.json"), "Missing app config");
  assertExists(path.join(miniRoot, "app.js"), "Missing app entry");

  const projectConfig = readJson(projectConfigPath);
  if (projectConfig.miniprogramRoot !== "miniprogram/") {
    throw new Error(`project.config.json miniprogramRoot must stay "miniprogram/", received "${projectConfig.miniprogramRoot}"`);
  }

  const appJsonPath = path.join(miniRoot, "app.json");
  const appJson = readJson(appJsonPath);
  const componentTargets = new Set(collectUsingComponentsTargets(appJsonPath));

  (appJson.pages || []).forEach((pagePath) => {
    ensurePageBundle(pagePath);
    const pageJsonPath = path.join(miniRoot, `${pagePath}.json`);
    collectUsingComponentsTargets(pageJsonPath).forEach((target) => componentTargets.add(target));
  });

  for (const componentPath of componentTargets) {
    ensureComponentBundle(componentPath);
    const componentJsonPath = path.join(miniRoot, `${normalizeComponentPath(componentPath)}.json`);
    collectUsingComponentsTargets(componentJsonPath).forEach((nestedPath) => componentTargets.add(nestedPath));
  }

  console.log("Miniprogram runtime check passed.");
}

main();
