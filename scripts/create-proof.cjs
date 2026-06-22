const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

const args = process.argv.slice(2);

function getArg(name, fallback) {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return fallback;
  return args[index + 1] || fallback;
}

function requireHash(name, value) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value || "")) {
    throw new Error(`Invalid or missing ${name}: ${value}`);
  }
  return value;
}

function optionalRoot(value) {
  return value || "";
}

function requireRoot(name, value) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value || "")) {
    throw new Error(`Invalid or missing ${name}. Run npm run report:upload before proof:create.`);
  }
  return value;
}

const metadataPath = path.resolve(
  getArg(
    "metadata",
    process.env.TRADE_PROOF_METADATA_PATH ||
      path.join(
        __dirname,
        `../data/report-proof-metadata-${(process.env.REPORT_PERIOD || "2025-Q4").toLowerCase()}.json`,
      ),
  ),
);
const contractAddress = getArg("contract", process.env.TRADE_PROOF_REGISTRY_ADDRESS);

if (!contractAddress) {
  throw new Error(
    "Missing contract address. Set TRADE_PROOF_REGISTRY_ADDRESS or pass --contract <address>.",
  );
}

async function main() {
  const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));

  const registry = await hre.ethers.getContractAt("TradeProofRegistry", contractAddress);
  const proofId = await registry.getProofCount();

  console.log("Creating TradeProof report proof on 0G Chain...");
  console.log("Contract:", contractAddress);
  console.log("Metadata:", metadataPath);
  console.log("Next proof ID:", proofId.toString());
  console.log("Report period:", metadata.report_period);
  console.log("rawSnapshotHash:", metadata.raw_snapshot.hash);
  console.log("fullReportHash:", metadata.reports.full_internal.hash);
  console.log("publicReportHash:", metadata.reports.redacted_public.hash);

  const tx = await registry.createReportProof({
    reportPeriod: metadata.report_period,
    rawSnapshotHash: requireHash("rawSnapshotHash", metadata.raw_snapshot.hash),
    fullReportHash: requireHash("fullReportHash", metadata.reports.full_internal.hash),
    publicReportHash: requireHash("publicReportHash", metadata.reports.redacted_public.hash),
    promptHash: requireHash("promptHash", metadata.prompt.hash),
    redactionPolicyHash: requireHash("redactionPolicyHash", metadata.redaction_policy.hash),
    metadataHash: requireHash("metadataHash", metadata.metadata_file?.hash),
    rawSnapshotStorageRoot: requireRoot("rawSnapshotStorageRoot", metadata.raw_snapshot.storage_root_hash),
    fullReportStorageRoot: requireRoot(
      "fullReportStorageRoot",
      metadata.reports.full_internal.storage_root_hash,
    ),
    publicReportStorageRoot: requireRoot(
      "publicReportStorageRoot",
      metadata.reports.redacted_public.storage_root_hash,
    ),
    metadataStorageRoot: requireRoot("metadataStorageRoot", metadata.metadata_file?.storage_root_hash),
    modelId: metadata.model_id,
    computeMode: metadata.compute_mode,
    note: metadata.note,
  });

  console.log("Transaction sent:", tx.hash);
  console.log("Explorer:", `https://chainscan-galileo.0g.ai/tx/${tx.hash}`);

  const receipt = await tx.wait();
  console.log("Transaction confirmed in block:", receipt.blockNumber);
  console.log("Proof ID:", proofId.toString());
  console.log("Contract:", contractAddress);
  console.log("Tx Hash:", tx.hash);

  metadata.proof_registry = {
    ...(metadata.proof_registry || {}),
    network: process.env.NETWORK || metadata.proof_registry?.network || "testnet",
    contract_address: contractAddress,
    proof_id: Number(proofId),
    transaction_hash: tx.hash,
    chain_tx_hash: tx.hash,
    block_number: Number(receipt.blockNumber),
    created_at: new Date().toISOString(),
  };

  fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
  console.log("Metadata updated with proof registry details.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
