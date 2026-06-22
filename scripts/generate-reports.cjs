const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
require("dotenv").config();

const args = process.argv.slice(2);

function getArg(name, fallback) {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return fallback;
  return args[index + 1] || fallback;
}

const period = getArg("period", process.env.REPORT_PERIOD || "2025-Q4");
const rawDataPath = path.resolve(
  getArg("input", path.join(__dirname, `../data/raw-business-records-${period.toLowerCase()}.json`)),
);
const redactionPolicyPath = path.resolve(
  getArg("policy", path.join(__dirname, "../config/redaction-policy.json")),
);
const outputDir = path.resolve(getArg("output-dir", path.join(__dirname, "../data")));
const computeArg = getArg("compute", "mock");

if (computeArg !== "mock" && computeArg !== "0g") {
  throw new Error(`Invalid --compute value "${computeArg}". Use "mock" or "0g".`);
}

const fullReportPath = path.join(outputDir, `full-report-${period.toLowerCase()}.json`);
const publicReportPath = path.join(outputDir, `public-report-${period.toLowerCase()}.json`);
const proofMetadataPath = path.join(outputDir, `report-proof-metadata-${period.toLowerCase()}.json`);

const computeMode = computeArg === "0g" ? "0g_private_computer" : "mock_0g_compute";
const computeProvider = computeArg === "0g" ? "0G Private Computer" : "Local deterministic mock";
const generatedBy = computeArg === "0g" ? "0G Compute" : "Local mock generator";
const modelId =
  computeArg === "0g"
    ? process.env.OG_COMPUTE_MODEL || "0GM-1.0-35B-A3B"
    : "tradeproof-capability-report-generator-v1";
const generatedAt = new Date().toISOString();

function buildReportPrompt(snapshot, policy) {
  return `
Generate a manufacturing business capability report for supplier audit preparation.
Use exactly one confidential raw business snapshot as input.
Create two reports from the same input:
1. A full internal report that may include sensitive business details for internal decision-making.
2. A redacted public report that must not disclose customer names, contacts, exact prices, exact amounts, margin, order identifiers, or payment terms.
There is only one raw snapshot. The public report is not generated from another sanitized snapshot.
The public report is AI-processed output where sensitive fields are deleted, generalized, or aggregated during generation.
The public report may disclose derived and aggregated capability signals such as customer regions, customer industries, customer size tiers, product model distribution, order status distribution, application distribution, and quantity ranges.
The public report must not include customer_name, contact_name, email, order_id, quoted_unit_price_usd, exact amount_usd, margin_rate, payment_terms, internal_notes, any raw customer name, any raw email, or any raw order id.
The public report may include region distribution, industry distribution, product capability, quantity range, customer type / industry profile, and supplier capability summary.
Do not fabricate records. Derived customer context must come from fields available in the raw snapshot or from explicitly recorded enrichment fields.
Return JSON only, with no markdown and no explanatory text. Use this shape:
{
  "full_internal_report": {
    "executive_summary": "string",
    "internal_capability_assessment": {
      "export_market_coverage": "string",
      "customer_quality_signal": "string",
      "product_capability": "string",
      "production_signal": "string"
    }
  },
  "redacted_public_report": {
    "public_summary": "string",
    "capability_summary": {
      "export_reach": "string",
      "served_industries": "string",
      "product_range": "string",
      "audit_relevance": "string"
    }
  }
}

Redaction policy:
${JSON.stringify(policy, null, 2)}

Sensitive raw snapshot:
${JSON.stringify(snapshot, null, 2)}
`.trim();
}

function canonicalize(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256Hex(value) {
  const data = typeof value === "string" ? value : canonicalize(value);
  return `0x${crypto.createHash("sha256").update(data).digest("hex")}`;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function recordsFromSnapshot(snapshot) {
  if (!Array.isArray(snapshot.records)) {
    throw new Error(`Invalid raw snapshot: expected "records" array in ${rawDataPath}`);
  }
  return snapshot.records;
}

function countBy(records, key) {
  return records.reduce((acc, item) => {
    const value = item[key] || "Unknown";
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function uniqueSorted(records, key) {
  return [...new Set(records.map((item) => item[key]).filter(Boolean))].sort();
}

function sum(records, key) {
  return records.reduce((total, item) => total + Number(item[key] || 0), 0);
}

function min(records, key) {
  return Math.min(...records.map((item) => Number(item[key] || 0)));
}

function max(records, key) {
  return Math.max(...records.map((item) => Number(item[key] || 0)));
}

function quantityRange(totalQuantity, policy) {
  const bucketSize = Number(policy.quantity_bucket_policy?.bucket_size_units || 50000);
  const low = Math.floor(totalQuantity / bucketSize) * bucketSize;
  const high = Math.ceil(totalQuantity / bucketSize) * bucketSize;
  return {
    lower_bound_units: low,
    upper_bound_units: high,
    display: `${low.toLocaleString("en-US")} - ${high.toLocaleString("en-US")} units`,
  };
}

function collectMainProducts(records) {
  const counts = {};
  for (const record of records) {
    for (const product of record.customer_main_products || []) {
      counts[product] = (counts[product] || 0) + 1;
    }
  }
  return counts;
}

function stripJsonFence(text) {
  const trimmed = String(text || "").trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function pickObject(...values) {
  return values.find((value) => value && typeof value === "object" && !Array.isArray(value)) || {};
}

function pickString(...values) {
  return values.find((value) => typeof value === "string" && value.trim().length > 0);
}

async function call0gCompute(prompt) {
  const apiKey = process.env.OG_COMPUTE_API_KEY;
  const baseUrl = process.env.OG_COMPUTE_BASE_URL || "https://router-api.0g.ai/v1";

  if (!apiKey) {
    throw new Error("Missing OG_COMPUTE_API_KEY. Set it in .env before running npm run report:generate:0g.");
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      temperature: 0.1,
      max_tokens: 6000,
      chat_template_kwargs: {
        enable_thinking: false,
      },
      messages: [
        {
          role: "system",
          content:
            "You generate manufacturing audit reports. Return valid JSON only. Do not include markdown fences, explanatory text, or hidden reasoning. Do not think step by step in the response.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(`0G Compute request failed with HTTP ${response.status}: ${responseText.slice(0, 1000)}`);
  }

  let payload;
  try {
    payload = JSON.parse(responseText);
  } catch {
    throw new Error(`0G Compute returned non-JSON HTTP payload: ${responseText.slice(0, 1000)}`);
  }

  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error(`0G Compute response did not include message content: ${responseText.slice(0, 1000)}`);
  }

  try {
    return JSON.parse(stripJsonFence(content));
  } catch {
    console.error("Failed to parse 0G Compute JSON output. First 1000 chars:");
    console.error(String(content).slice(0, 1000));
    throw new Error("0G Compute output was not valid JSON. Re-run or adjust the prompt.");
  }
}

function normalizeReports(modelOutput, snapshot, policy) {
  const fullReport = createFullReport(snapshot, policy);
  const publicReport = createPublicReport(snapshot, fullReport, policy);

  const fullCandidate = pickObject(
    modelOutput?.full_internal_report,
    modelOutput?.fullInternalReport,
    modelOutput?.full_report,
    modelOutput?.fullReport,
  );
  const publicCandidate = pickObject(
    modelOutput?.redacted_public_report,
    modelOutput?.redactedPublicReport,
    modelOutput?.public_report,
    modelOutput?.publicReport,
  );

  fullReport.executive_summary =
    pickString(fullCandidate.executive_summary, fullCandidate.internal_summary, fullReport.executive_summary) ||
    fullReport.executive_summary;

  const modelInternalAssessment = pickObject(
    fullCandidate.internal_capability_assessment,
    fullCandidate.business_capability_assessment,
  );
  fullReport.internal_capability_assessment = {
    ...fullReport.internal_capability_assessment,
    ...modelInternalAssessment,
  };

  publicReport.public_summary =
    pickString(publicCandidate.public_summary, publicCandidate.summary, publicReport.public_summary) ||
    publicReport.public_summary;

  const modelCapabilitySummary = pickObject(publicCandidate.capability_summary, publicCandidate.capability_signals);
  publicReport.capability_summary = {
    ...publicReport.capability_summary,
    ...modelCapabilitySummary,
  };

  return { fullReport, publicReport };
}

function createFullReport(snapshot, policy) {
  const records = recordsFromSnapshot(snapshot);
  const totalQuantity = sum(records, "quantity");
  const totalAmount = sum(records, "amount_usd");

  return {
    report_id: `FULL-${snapshot.snapshot_id}`,
    report_period: snapshot.report_period,
    report_type: "Full Internal Business Capability Report",
    confidentiality: "internal_confidential",
    generated_at: generatedAt,
    generation_context: {
      compute_mode: computeMode,
      model_id: modelId,
      input_snapshot_id: snapshot.snapshot_id,
      input_snapshot_count: 1,
      redaction_policy_id: policy.policy_id,
    },
    executive_summary:
      "This internal report analyzes one confidential quarterly export business snapshot for NTC thermistor sensor products, including customer identity, commercial terms, product demand, and delivery capability signals.",
    source_snapshot: {
      snapshot_id: snapshot.snapshot_id,
      snapshot_type: snapshot.snapshot_type,
      generated_by: snapshot.generated_by,
      generated_at: snapshot.generated_at,
      company: snapshot.company,
      sensitivity: snapshot.sensitivity,
    },
    business_metrics: {
      total_records: records.length,
      total_quantity: totalQuantity,
      total_amount_usd: totalAmount,
      min_order_quantity: min(records, "quantity"),
      max_order_quantity: max(records, "quantity"),
      average_order_amount_usd: Number((totalAmount / records.length).toFixed(2)),
    },
    distributions: {
      customer_region: countBy(records, "customer_region"),
      customer_country: countBy(records, "customer_country"),
      customer_industry: countBy(records, "customer_industry"),
      customer_size_tier: countBy(records, "customer_size_tier"),
      product_model: countBy(records, "model"),
      status: countBy(records, "status"),
      application: countBy(records, "application"),
    },
    commercial_details: records,
    internal_capability_assessment: {
      export_market_coverage:
        "The snapshot shows active export-facing opportunities across Europe, Asia, South America, and North America.",
      customer_quality_signal:
        "The customer base spans industrial automation, home appliance, HVAC, battery pack, consumer electronics, and automotive electronics segments.",
      product_capability:
        "The factory handles standard MF58/MF59A thermistor sensors, epoxy coated variants, and custom probe requests.",
      production_signal:
        "The quarter includes sample requests, quotations, and confirmed orders, indicating both business pipeline activity and order execution capability.",
    },
  };
}

function createPublicReport(snapshot, fullReport, policy) {
  const records = recordsFromSnapshot(snapshot);
  const totalQuantity = fullReport.business_metrics.total_quantity;

  return {
    report_id: `PUBLIC-${snapshot.snapshot_id}`,
    report_period: snapshot.report_period,
    report_type: "Redacted Public Business Capability Report",
    confidentiality: "public_redacted",
    generated_at: fullReport.generated_at,
    generation_context: {
      compute_mode: computeMode,
      model_id: modelId,
      input_snapshot_count: 1,
      redaction_policy_id: policy.policy_id,
    },
    public_summary:
      "This public report summarizes export-facing business activity for NTC thermistor sensor products. It is derived from one confidential business snapshot, but customer identities, contacts, exact commercial terms, exact transaction amounts, and order-level identifiers are not disclosed.",
    disclosed_metrics: {
      total_records: records.length,
      total_quantity_range: quantityRange(totalQuantity, policy),
      active_customer_regions: uniqueSorted(records, "customer_region"),
      product_model_count: Object.keys(fullReport.distributions.product_model).length,
    },
    derived_customer_context: {
      customer_region_distribution: fullReport.distributions.customer_region,
      customer_country_distribution: fullReport.distributions.customer_country,
      customer_industry_distribution: fullReport.distributions.customer_industry,
      customer_size_tier_distribution: fullReport.distributions.customer_size_tier,
      end_market_distribution: fullReport.distributions.application,
      customer_main_product_signals: collectMainProducts(records),
    },
    product_and_pipeline_signals: {
      product_model_distribution: fullReport.distributions.product_model,
      status_distribution: fullReport.distributions.status,
      application_distribution: fullReport.distributions.application,
    },
    capability_summary: {
      export_reach:
        "The factory has export-facing business activity across multiple international regions.",
      served_industries:
        "The customer base indicates relevance to industrial automation, home appliance, HVAC, battery pack, consumer electronics, and automotive electronics supply chains.",
      product_range:
        "The records indicate capability across standard NTC thermistor models and customized temperature probe requests.",
      audit_relevance:
        "The report provides a verifiable supplier capability signal without exposing customer identity or exact commercial terms.",
    },
    redaction_statement: {
      policy_id: policy.policy_id,
      input_snapshot_count: 1,
      description:
        "AI processing used the confidential input snapshot to derive aggregate capability signals. Sensitive customer identity, contact, order identifier, exact price, exact amount, margin, and payment term details were removed from this public output.",
    },
  };
}

async function main() {
  const rawSnapshot = readJson(rawDataPath);
  const redactionPolicy = readJson(redactionPolicyPath);

  if (rawSnapshot.report_period !== period) {
    throw new Error(
      `Raw snapshot report_period "${rawSnapshot.report_period}" does not match requested period "${period}"`,
    );
  }

  const reportPrompt = buildReportPrompt(rawSnapshot, redactionPolicy);
  let fullReport;
  let publicReport;

  if (computeArg === "0g") {
    console.log("Generating reports with 0G Compute / Private Computer...");
    console.log("Model:", modelId);
    const modelOutput = await call0gCompute(reportPrompt);
    ({ fullReport, publicReport } = normalizeReports(modelOutput, rawSnapshot, redactionPolicy));
  } else {
    fullReport = createFullReport(rawSnapshot, redactionPolicy);
    publicReport = createPublicReport(rawSnapshot, fullReport, redactionPolicy);
  }

  writeJson(fullReportPath, fullReport);
  writeJson(publicReportPath, publicReport);

  const rawSnapshotHash = sha256Hex(rawSnapshot);
  const redactionPolicyHash = sha256Hex(redactionPolicy);
  const promptHash = sha256Hex(reportPrompt);
  const fullReportHash = sha256Hex(fullReport);
  const publicReportHash = sha256Hex(publicReport);

  const metadata = {
    metadata_version: "tradeproof.report-proof.v1",
    report_period: period,
    reportPeriod: period,
    report_type: "Manufacturing Business Capability Report",
    generated_at: generatedAt,
    generatedAt,
    generatedBy,
    compute_mode: computeMode,
    computeMode,
    compute_provider: computeProvider,
    computeProvider,
    model_id: modelId,
    modelId,
    input_snapshot_count: 1,
    inputSnapshotCount: 1,
    hash_algorithm: "sha256",
    hashAlgorithm: "sha256",
    rawSnapshotHash,
    fullReportHash,
    publicReportHash,
    promptHash,
    redactionPolicyHash,
    raw_snapshot: {
      path: path.relative(path.join(__dirname, ".."), rawDataPath),
      snapshot_id: rawSnapshot.snapshot_id,
      hash_algorithm: "sha256",
      hash: rawSnapshotHash,
      storage_root_hash: null,
      storage_tx_hash: null,
    },
    redaction_policy: {
      path: path.relative(path.join(__dirname, ".."), redactionPolicyPath),
      policy_id: redactionPolicy.policy_id,
      hash_algorithm: "sha256",
      hash: redactionPolicyHash,
    },
    prompt: {
      hash_algorithm: "sha256",
      hash: promptHash,
    },
    reports: {
      full_internal: {
        path: path.relative(path.join(__dirname, ".."), fullReportPath),
        hash_algorithm: "sha256",
        hash: fullReportHash,
        storage_root_hash: null,
        storage_tx_hash: null,
      },
      redacted_public: {
        path: path.relative(path.join(__dirname, ".."), publicReportPath),
        hash_algorithm: "sha256",
        hash: publicReportHash,
        storage_root_hash: null,
        storage_tx_hash: null,
      },
    },
    proof_registry: {
      network: process.env.NETWORK || "testnet",
      contract_address: process.env.TRADE_PROOF_REGISTRY_ADDRESS || null,
      proof_id: null,
      transaction_hash: null,
    },
    metadata_file: {
      path: path.relative(path.join(__dirname, ".."), proofMetadataPath),
      hash_algorithm: "sha256",
      hash: null,
      storage_root_hash: null,
      storage_tx_hash: null,
      uploaded_at: null,
    },
    note:
      "One confidential raw business snapshot is the single input. The full internal report and redacted public report are both generated from that same input.",
  };

  writeJson(proofMetadataPath, metadata);

  console.log("TradeProof reports generated successfully.");
  console.log("Compute mode:", computeMode);
  console.log("Raw snapshot:", rawDataPath);
  console.log("Full report:", fullReportPath);
  console.log("Public report:", publicReportPath);
  console.log("Proof metadata:", proofMetadataPath);
  console.log("");
  console.log("rawSnapshotHash:", metadata.raw_snapshot.hash);
  console.log("redactionPolicyHash:", metadata.redaction_policy.hash);
  console.log("promptHash:", metadata.prompt.hash);
  console.log("fullReportHash:", metadata.reports.full_internal.hash);
  console.log("publicReportHash:", metadata.reports.redacted_public.hash);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
