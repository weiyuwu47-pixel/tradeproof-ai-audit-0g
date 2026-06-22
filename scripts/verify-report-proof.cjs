const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const args = process.argv.slice(2);

function getArg(name, fallback) {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return fallback;
  return args[index + 1] || fallback;
}

function hasFlag(name) {
  return args.includes(`--${name}`);
}

const metadataPath = path.resolve(
  getArg(
    "metadata",
    path.join(
      __dirname,
      `../data/report-proof-metadata-${(process.env.REPORT_PERIOD || "2025-Q4").toLowerCase()}.json`,
    ),
  ),
);
const publicReportPath = path.resolve(
  getArg(
    "public",
    path.join(__dirname, `../data/public-report-${(process.env.REPORT_PERIOD || "2025-Q4").toLowerCase()}.json`),
  ),
);
const rawSnapshotPath = getArg("raw", null);
const contractAddress = getArg("contract", process.env.TRADE_PROOF_REGISTRY_ADDRESS);
const proofIdArg = getArg("id", null);
const proofIdEnv = process.env.TRADE_PROOF_ID || null;

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

function assertEqual(label, actual, expected, failures) {
  if (actual !== expected) {
    failures.push(`${label} mismatch\n  actual:   ${actual}\n  expected: ${expected}`);
  } else {
    console.log(`OK ${label}: ${actual}`);
  }
}

function metadataProofPayload(metadata) {
  return {
    report_period: metadata.report_period,
    raw_snapshot: metadata.raw_snapshot,
    reports: metadata.reports,
    storage_bundle: {
      uploaded_at: metadata.storage_bundle?.uploaded_at,
      raw_snapshot: metadata.storage_bundle?.files?.raw_snapshot,
      full_internal_report: metadata.storage_bundle?.files?.full_internal_report,
      redacted_public_report: metadata.storage_bundle?.files?.redacted_public_report,
    },
  };
}

function runRedactionCheck(reportPeriod, publicReportPath) {
  const { spawnSync } = require("child_process");
  const result = spawnSync(
    process.execPath,
    [
      path.join(__dirname, "check-redaction.cjs"),
      "--public",
      publicReportPath,
      "--period",
      reportPeriod,
      "--policy",
      path.resolve(__dirname, "../config/redaction-policy.json"),
    ],
    {
      cwd: path.resolve(__dirname, ".."),
      encoding: "utf8",
    },
  );
  if (result.stdout.trim()) console.log(result.stdout.trim());
  if (result.stderr.trim()) console.error(result.stderr.trim());
  return result.status === 0;
}

async function readChainProof(contractAddressToRead, proofId) {
  const { ethers } = require("ethers");
  const artifact = require("../artifacts/contracts/TradeProofRegistry.sol/TradeProofRegistry.json");
  const rpcUrl = process.env.OG_RPC_URL || "https://evmrpc-testnet.0g.ai";
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  console.log("Chain RPC env var: OG_RPC_URL");
  console.log("Contract address:", contractAddressToRead);
  console.log("Proof ID:", proofId);

  const network = await provider.getNetwork();
  console.log("Chain ID:", network.chainId.toString());

  const code = await provider.getCode(contractAddressToRead);
  if (code === "0x") {
    throw new Error(
      `contract not found on this RPC/network: ${contractAddressToRead}. Check OG_RPC_URL and TRADE_PROOF_REGISTRY_ADDRESS.`,
    );
  }

  const registry = new ethers.Contract(contractAddressToRead, artifact.abi, provider);
  const proof = await registry.getProof(proofId);
  console.log("PASS on-chain proof loaded");
  return proof;
}

async function main() {
  const failures = [];
  const metadata = readJson(metadataPath);
  const publicReport = readJson(publicReportPath);

  console.log("Verifying TradeProof report package...");
  console.log("Metadata:", metadataPath);
  console.log("Public report:", publicReportPath);

  if (!runRedactionCheck(metadata.report_period, publicReportPath)) {
    failures.push("redaction check failed");
  } else {
    console.log("OK redaction check");
  }

  assertEqual(
    "public report hash",
    sha256Hex(publicReport),
    metadata.reports.redacted_public.hash,
    failures,
  );

  assertEqual(
    "report period",
    publicReport.report_period,
    metadata.report_period,
    failures,
  );

  assertEqual(
    "model id",
    publicReport.generation_context?.model_id,
    metadata.model_id,
    failures,
  );

  assertEqual(
    "redaction policy id",
    publicReport.generation_context?.redaction_policy_id,
    metadata.redaction_policy.policy_id,
    failures,
  );

  assertEqual(
    "input snapshot count",
    String(publicReport.generation_context?.input_snapshot_count),
    String(metadata.input_snapshot_count),
    failures,
  );

  if (rawSnapshotPath) {
    const rawSnapshot = readJson(path.resolve(rawSnapshotPath));
    assertEqual("raw snapshot hash", sha256Hex(rawSnapshot), metadata.raw_snapshot.hash, failures);
  } else {
    console.log("SKIP raw snapshot hash: no --raw path provided");
  }

  if (metadata.metadata_file?.hash) {
    assertEqual(
      "metadata proof payload hash",
      sha256Hex(metadataProofPayload(metadata)),
      metadata.metadata_file.hash,
      failures,
    );
  } else {
    console.log("SKIP metadata proof payload hash: metadata has not been uploaded yet");
  }

  const metadataProofId = metadata.proof_registry?.proof_id ?? metadata.proofId;
  const proofId =
    metadataProofId !== null && metadataProofId !== undefined
      ? Number(metadataProofId)
      : proofIdArg !== null
        ? Number(proofIdArg)
        : proofIdEnv !== null
          ? Number(proofIdEnv)
          : null;

  const metadataContractAddress =
    metadata.proof_registry?.contract_address ||
    metadata.proof_registry?.contractAddress ||
    metadata.contractAddress;
  const resolvedContractAddress = metadataContractAddress || contractAddress;

  const hasMetadataChainProof =
    resolvedContractAddress &&
    proofId !== null &&
    proofId !== undefined &&
    !Number.isNaN(proofId);
  const shouldVerifyChain = hasFlag("chain") || hasMetadataChainProof;

  if (shouldVerifyChain) {
    if (!resolvedContractAddress) {
      failures.push("Chain verification requested, but no contract address was provided.");
    } else if (proofId === null || Number.isNaN(proofId)) {
      failures.push("Chain verification requested, but no proof id was provided.");
    } else {
      const proof = await readChainProof(resolvedContractAddress, proofId);
      assertEqual("chain report period", proof.reportPeriod, metadata.report_period, failures);
      assertEqual("chain raw snapshot hash", proof.rawSnapshotHash, metadata.raw_snapshot.hash, failures);
      assertEqual(
        "chain full report hash",
        proof.fullReportHash,
        metadata.reports.full_internal.hash,
        failures,
      );
      assertEqual(
        "chain public report hash",
        proof.publicReportHash,
        metadata.reports.redacted_public.hash,
        failures,
      );
      assertEqual("chain prompt hash", proof.promptHash, metadata.prompt.hash, failures);
      assertEqual(
        "chain redaction policy hash",
        proof.redactionPolicyHash,
        metadata.redaction_policy.hash,
        failures,
      );
      assertEqual("chain metadata hash", proof.metadataHash, metadata.metadata_file?.hash || "", failures);
      assertEqual(
        "chain raw snapshot storage root",
        proof.rawSnapshotStorageRoot,
        metadata.raw_snapshot.storage_root_hash || "",
        failures,
      );
      assertEqual(
        "chain full report storage root",
        proof.fullReportStorageRoot,
        metadata.reports.full_internal.storage_root_hash || "",
        failures,
      );
      assertEqual(
        "chain public report storage root",
        proof.publicReportStorageRoot,
        metadata.reports.redacted_public.storage_root_hash || "",
        failures,
      );
      assertEqual(
        "chain metadata storage root",
        proof.metadataStorageRoot,
        metadata.metadata_file?.storage_root_hash || "",
        failures,
      );
      assertEqual("chain model id", proof.modelId, metadata.model_id, failures);
      assertEqual("chain compute mode", proof.computeMode, metadata.compute_mode, failures);
      console.log("PASS on-chain hashes match metadata");
      console.log("PASS storage roots match metadata");
    }
  } else {
    console.log("Local verification passed, on-chain proof not found in metadata.");
  }

  if (failures.length > 0) {
    console.error("");
    console.error("FAIL TradeProof verification failed.");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log("");
  console.log("PASS TradeProof verification passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
