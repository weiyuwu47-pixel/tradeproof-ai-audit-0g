const fs = require("fs");
const path = require("path");

const period = process.env.REPORT_PERIOD || "2025-Q4";
const suffix = period.toLowerCase();
const root = path.join(__dirname, "..");
const outputDir = path.join(root, "web/public/demo-data");

const files = [
  [`data/full-report-${suffix}.json`, `full-report-${suffix}.json`],
  [`data/public-report-${suffix}.json`, `public-report-${suffix}.json`],
  [`data/report-proof-metadata-${suffix}.json`, `report-proof-metadata-${suffix}.json`],
  ["config/redaction-policy.json", "redaction-policy.json"],
  [`data/raw-business-records-${suffix}.json`, `raw-business-records-${suffix}.json`],
];

fs.mkdirSync(outputDir, { recursive: true });

for (const [sourceRelative, targetName] of files) {
  const source = path.join(root, sourceRelative);
  const target = path.join(outputDir, targetName);
  if (!fs.existsSync(source)) {
    throw new Error(`Missing demo source file: ${sourceRelative}`);
  }
  fs.copyFileSync(source, target);
  console.log(`Synced ${sourceRelative} -> web/public/demo-data/${targetName}`);
}

console.log("Web demo data synced.");
