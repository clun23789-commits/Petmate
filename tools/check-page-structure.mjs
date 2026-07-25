import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);

const { PAGE_ROUTES, TAB_ROUTES } = require("../miniprogram/utils/routes.js");

const pageExtensions = ["js", "wxml", "json", "wxss"];
const requiredExplicitBackPages = [
  "pages/works/generating/index",
  "pages/works/result/index",
  "pages/works/payment/index",
  "pages/works/exception/index",
  "pages/works/ar-failure/index"
];
const internalSitemapDisallowPages = [
  "pages/works/upload/index",
  "pages/works/generating/index",
  "pages/works/payment/index",
  "pages/works/ar-view/index",
  "pages/works/exception/index",
  "pages/works/ar-failure/index"
];
const forbiddenShareRouteFragments = [
  "/pages/works/upload/index",
  "/pages/works/payment/index",
  "/pages/works/result/index",
  "PAGE_ROUTES.works.upload",
  "PAGE_ROUTES.works.payment",
  "PAGE_ROUTES.works.result"
];
const forbiddenCaseAndShareAdUnlockFragments = [
  "/pages/works/ad-unlock/index",
  "PAGE_ROUTES.works.adUnlock",
  "AD_UNLOCK_PATH"
];
const forbiddenDirectArViewFragments = [
  "/pages/works/ar-view/index",
  "PAGE_ROUTES.works.arView"
];
const forbiddenPageRouteFragments = [
  "/pages/dialogs/",
  "/pages/modals/",
  "/pages/works/payment-success/",
  "/pages/works/entitlement-success/",
  "/pages/mine/nickname-editor/",
  "/pages/mine/logout-confirm/",
  "/pages/works/delete-confirm/"
];

function projectPath(relativePath) {
  return path.join(projectRoot, ...relativePath.split(/[\\/]/));
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(projectPath(relativePath), "utf8"));
}

function readText(relativePath) {
  return fs.readFileSync(projectPath(relativePath), "utf8");
}

function normalizeAppRoute(route) {
  return String(route || "").replace(/\\/g, "/").replace(/^\/+/, "");
}

function flattenRoutes(group) {
  return Object.values(group).flatMap((value) =>
    value && typeof value === "object" ? flattenRoutes(value) : [normalizeAppRoute(value)]
  );
}

function collectPageDirs(rootDir) {
  const result = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolutePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(absolutePath);
        continue;
      }
      if (entry.isFile() && entry.name === "index.js") {
        result.push(
          normalizeAppRoute(path.relative(projectPath("miniprogram"), path.join(dir, "index")))
        );
      }
    }
  }
  walk(rootDir);
  return result.sort();
}

function findFiles(dir, predicate, result = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findFiles(absolutePath, predicate, result);
      continue;
    }
    if (entry.isFile() && predicate(absolutePath)) {
      result.push(absolutePath);
    }
  }
  return result;
}

function relativeProjectPath(absolutePath) {
  return path.relative(projectRoot, absolutePath).replace(/\\/g, "/");
}

function unique(values) {
  return Array.from(new Set(values));
}

const errors = [];
const appJson = readJson("miniprogram/app.json");
const sitemap = readJson("miniprogram/sitemap.json");
const appPages = appJson.pages.map(normalizeAppRoute);
const routeRegistryPages = flattenRoutes(PAGE_ROUTES).sort();
const pageDirs = collectPageDirs(projectPath("miniprogram/pages"));
const tabRoutes = (appJson.tabBar?.list || []).map((item) => normalizeAppRoute(item.pagePath));
const expectedTabRoutes = TAB_ROUTES.map(normalizeAppRoute);

if (appPages.length !== 29) {
  errors.push(`Expected 29 app.json pages, found ${appPages.length}.`);
}

if (unique(appPages).length !== appPages.length) {
  errors.push("app.json pages contain duplicates.");
}

const missingFromRegistry = appPages.filter((route) => !routeRegistryPages.includes(route));
const missingFromAppJson = routeRegistryPages.filter((route) => !appPages.includes(route));
if (missingFromRegistry.length) {
  errors.push(`Routes missing from utils/routes.js: ${missingFromRegistry.join(", ")}.`);
}
if (missingFromAppJson.length) {
  errors.push(`Routes registered in utils/routes.js but missing from app.json: ${missingFromAppJson.join(", ")}.`);
}

const unregisteredPageDirs = pageDirs.filter((route) => !appPages.includes(route));
const registeredMissingDirs = appPages.filter((route) => !pageDirs.includes(route));
if (unregisteredPageDirs.length) {
  errors.push(`Page directories missing from app.json: ${unregisteredPageDirs.join(", ")}.`);
}
if (registeredMissingDirs.length) {
  errors.push(`app.json routes missing index.js: ${registeredMissingDirs.join(", ")}.`);
}

for (const route of appPages) {
  for (const ext of pageExtensions) {
    if (!fs.existsSync(projectPath(`miniprogram/${route}.${ext}`))) {
      errors.push(`Registered page is missing .${ext}: ${route}.`);
    }
  }
}

for (const fragment of forbiddenPageRouteFragments) {
  if (appPages.some((route) => `/${route}`.includes(fragment))) {
    errors.push(`Forbidden state or dialog route found in app.json: ${fragment}.`);
  }
}

if (tabRoutes.length !== 3 || unique(tabRoutes).length !== 3) {
  errors.push("tabBar must contain exactly 3 unique pages.");
}
for (const route of expectedTabRoutes) {
  if (!tabRoutes.includes(route)) {
    errors.push(`tabBar missing required page: ${route}.`);
  }
}
for (const route of tabRoutes) {
  if (!expectedTabRoutes.includes(route)) {
    errors.push(`tabBar contains non-root page: ${route}.`);
  }
}

const jsFiles = findFiles(projectPath("miniprogram"), (filePath) => filePath.endsWith(".js"));
for (const filePath of jsFiles) {
  const relativePath = relativeProjectPath(filePath);
  if (relativePath === "miniprogram/utils/navigation.js") {
    continue;
  }
  const content = fs.readFileSync(filePath, "utf8");
  for (const tabRoute of expectedTabRoutes) {
    const escapedRoute = tabRoute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const directWxIllegal = new RegExp(
      `wx\\.(navigateTo|redirectTo|reLaunch)\\s*\\(\\s*\\{[\\s\\S]{0,140}url\\s*:\\s*[\`'"]/?${escapedRoute}`,
      "m"
    );
    const helperIllegal = new RegExp(
      `\\b(navigate|replace|relaunch)\\s*\\(\\s*[\`'"]/?${escapedRoute}`,
      "m"
    );
    if (directWxIllegal.test(content) || helperIllegal.test(content)) {
      errors.push(`Illegal non-switchTab navigation to tab page in ${relativePath}: ${tabRoute}.`);
    }
  }
}

for (const route of requiredExplicitBackPages) {
  const wxmlPath = `miniprogram/${route}.wxml`;
  const wxml = readText(wxmlPath);
  if (!/auto-back="\{\{false\}\}"/.test(wxml) || !/bindback="/.test(wxml)) {
    errors.push(`High-risk page must use explicit back handling: ${route}.`);
  }
}

for (const relativePath of [
  "miniprogram/pages/share/landing/index.js",
  "miniprogram/pages/share/landing/index.wxml",
  "miniprogram/pages/share/conversion/index.js",
  "miniprogram/pages/share/conversion/index.wxml"
]) {
  const content = readText(relativePath);
  for (const fragment of forbiddenShareRouteFragments) {
    if (content.includes(fragment)) {
      errors.push(`Share page must not route to upload/payment/result: ${relativePath} uses ${fragment}.`);
    }
  }
}

const caseAndShareFiles = findFiles(projectPath("miniprogram/pages"), (filePath) => {
  const relativePath = relativeProjectPath(filePath);
  return /miniprogram\/pages\/(cases|share)\//.test(relativePath) && /\.(js|wxml)$/.test(relativePath);
});
for (const filePath of caseAndShareFiles) {
  const relativePath = relativeProjectPath(filePath);
  const content = fs.readFileSync(filePath, "utf8");
  for (const fragment of forbiddenCaseAndShareAdUnlockFragments) {
    if (content.includes(fragment)) {
      errors.push(`Cases/share pages must not route directly to ad unlock: ${relativePath} uses ${fragment}.`);
    }
  }
}

const pageJsFiles = findFiles(projectPath("miniprogram/pages"), (filePath) => filePath.endsWith(".js"));
for (const filePath of pageJsFiles) {
  const relativePath = relativeProjectPath(filePath);
  const content = fs.readFileSync(filePath, "utf8");
  for (const fragment of forbiddenDirectArViewFragments) {
    if (content.includes(fragment)) {
      errors.push(`Page code must enter AR through arFlow.enterArEntry/openArView guards: ${relativePath} uses ${fragment}.`);
    }
  }
}

if ((sitemap.rules || []).some((rule) => rule.action === "allow" && rule.page === "*")) {
  errors.push("sitemap.json must not allow every page with a wildcard rule.");
}
for (const route of internalSitemapDisallowPages) {
  const hasDisallow = (sitemap.rules || []).some((rule) => rule.action === "disallow" && rule.page === route);
  if (!hasDisallow) {
    errors.push(`sitemap.json must disallow internal page: ${route}.`);
  }
}

if (errors.length > 0) {
  console.error("Page structure check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("Page structure check passed.");
