const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);

function getArg(name, fallback) {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return fallback;
  return args[index + 1] || fallback;
}

const period = getArg("period", process.env.REPORT_PERIOD || "2025-Q4");
const rawDataPath = path.resolve(
  getArg("raw", path.join(__dirname, `../data/raw-business-records-${period.toLowerCase()}.json`)),
);
const publicReportPath = path.resolve(
  getArg("public", path.join(__dirname, `../data/public-report-${period.toLowerCase()}.json`)),
);
const redactionPolicyPath = path.resolve(
  getArg("policy", path.join(__dirname, "../config/redaction-policy.json")),
);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function walk(value, visitor, pathParts = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, visitor, [...pathParts, String(index)]));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      visitor({ key, value: item, path: [...pathParts, key] });
      walk(item, visitor, [...pathParts, key]);
    }
  }
}

function collectForbiddenValues(rawSnapshot, policy) {
  const values = new Set();
  const forbiddenFields = new Set(policy.forbidden_public_fields || []);

  for (const record of rawSnapshot.records || []) {
    for (const [key, value] of Object.entries(record)) {
      if (!forbiddenFields.has(key)) continue;
      if (value === null || value === undefined) continue;
      values.add(String(value));
    }
  }

  return [...values]
    .map((value) => value.trim())
    .filter((value) => value.length >= 3);
}

function normalizeForSearch(value) {
  return String(value).toLowerCase();
}

const rawSnapshot = readJson(rawDataPath);
const publicReport = readJson(publicReportPath);
const policy = readJson(redactionPolicyPath);

const publicText = JSON.stringify(publicReport);
const publicTextLower = normalizeForSearch(publicText);
const forbiddenFields = new Set(policy.forbidden_public_fields || []);
const forbiddenValues = collectForbiddenValues(rawSnapshot, policy);
const failures = [];

walk(publicReport, ({ key, path: itemPath }) => {
  if (forbiddenFields.has(key)) {
    failures.push(`Forbidden field key "${key}" appears at ${itemPath.join(".")}`);
  }
});

for (const value of forbiddenValues) {
  if (publicTextLower.includes(normalizeForSearch(value))) {
    failures.push(`Forbidden raw value appears in public report: "${value}"`);
  }
}

const emailMatches = publicText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi);
if (emailMatches) {
  for (const email of emailMatches) {
    failures.push(`Email-like value appears in public report: "${email}"`);
  }
}

if (failures.length > 0) {
  console.error("Redaction check failed.");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Redaction check passed.");
console.log("Public report:", publicReportPath);
console.log("Policy:", redactionPolicyPath);
console.log(`Forbidden raw values checked: ${forbiddenValues.length}`);
