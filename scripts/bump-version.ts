import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const filesToUpdate = [
  "package.json",
  "packages/cli/package.json",
  "packages/core/package.json",
  "packages/db/package.json",
  "apps/api/package.json",
  "apps/web/package.json",
];

const action = process.argv[2]; // major | minor | patch
if (!action || !["major", "minor", "patch"].includes(action)) {
  console.error("Usage: bun scripts/bump-version.ts <major|minor|patch>");
  process.exit(1);
}

// 1. Read current version from root package.json
const rootPkgPath = join(process.cwd(), "package.json");
let currentVersion = "0.1.0";
try {
  const rootPkg = JSON.parse(readFileSync(rootPkgPath, "utf-8"));
  currentVersion = rootPkg.version || "0.1.0";
} catch {
  console.error("Failed to read root package.json, defaulting to 0.1.0");
}

// 2. Parse version parts
const parts = currentVersion.split(".").map(Number);
if (parts.length !== 3 || parts.some(isNaN)) {
  console.error(`Invalid version format in root package.json: ${currentVersion}`);
  process.exit(1);
}

let [major, minor, patch] = parts;
if (action === "major") {
  major += 1;
  minor = 0;
  patch = 0;
} else if (action === "minor") {
  minor += 1;
  patch = 0;
} else if (action === "patch") {
  patch += 1;
}

const newVersion = `${major}.${minor}.${patch}`;
console.log(`Bumping version from ${currentVersion} to ${newVersion}...`);

// 3. Write new version to all package.json files
for (const relPath of filesToUpdate) {
  const filePath = join(process.cwd(), relPath);
  try {
    const pkg = JSON.parse(readFileSync(filePath, "utf-8"));
    pkg.version = newVersion;
    writeFileSync(filePath, JSON.stringify(pkg, null, 2) + "\n", "utf-8");
    console.log(`Updated ${relPath} to version ${newVersion}`);
  } catch (err) {
    console.error(`Failed to update ${relPath}:`, err);
  }
}

console.log("Version bump complete.");
