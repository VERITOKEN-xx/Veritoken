import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcRoot = path.join(repoRoot, "frontend", "src");
const envExamplePath = path.join(repoRoot, "frontend", ".env.example");

const sourceExtensions = new Set([".js", ".jsx", ".ts", ".tsx"]);
const envReadPattern = /import\.meta\.env\.([A-Z0-9_]+)/g;

function walkFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return walkFiles(fullPath);
    }
    return sourceExtensions.has(path.extname(entry.name)) ? [fullPath] : [];
  });
}

function readUsedEnvVars() {
  const vars = new Set();
  for (const file of walkFiles(srcRoot)) {
    const text = fs.readFileSync(file, "utf8");
    for (const match of text.matchAll(envReadPattern)) {
      vars.add(match[1]);
    }
  }
  return vars;
}

function readExampleEnvVars() {
  const vars = new Set();
  const text = fs.readFileSync(envExamplePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const match = trimmed.match(/^([A-Z0-9_]+)=/);
    if (match) {
      vars.add(match[1]);
    }
  }
  return vars;
}

const used = readUsedEnvVars();
const documented = readExampleEnvVars();

const missing = [...used].filter((name) => !documented.has(name)).sort();
const stale = [...documented].filter((name) => !used.has(name)).sort();

if (missing.length || stale.length) {
  if (missing.length) {
    console.error("Missing from frontend/.env.example:");
    for (const name of missing) {
      console.error(`  - ${name}`);
    }
  }
  if (stale.length) {
    console.error("Present in frontend/.env.example but not read by frontend/src:");
    for (const name of stale) {
      console.error(`  - ${name}`);
    }
  }
  process.exit(1);
}

console.log(`frontend env docs are in sync (${used.size} variables)`);
