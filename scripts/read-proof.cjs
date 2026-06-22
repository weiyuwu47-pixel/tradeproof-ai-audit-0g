const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

const args = process.argv.slice(2);

function getArg(name, fallback) {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return fallback;
  return args[index + 1] || fallback;
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

const metadata = fs.existsSync(metadataPath)
  ? JSON.parse(fs.readFileSync(metadataPath, "utf8"))
  : {};

const contractAddress = getArg(
  "contract",
  process.env.TRADE_PROOF_REGISTRY_ADDRESS || metadata.proof_registry?.contract_address,
);
const proofId = Number(
  getArg("id", process.env.TRADE_PROOF_ID || metadata.proof_registry?.proof_id || "0"),
);

if (!contractAddress) {
  throw new Error(
    "Missing contract address. Set TRADE_PROOF_REGISTRY_ADDRESS or pass --contract <address>.",
  );
}

async function main() {
  const registry = await hre.ethers.getContractAt("TradeProofRegistry", contractAddress);

  const count = await registry.getProofCount();
  console.log("Total proofs:", count.toString());

  const proof = await registry.getProof(proofId);

  console.log("Proof ID:", proofId);
  console.log("reportPeriod:", proof.reportPeriod);
  console.log("rawSnapshotHash:", proof.rawSnapshotHash);
  console.log("fullReportHash:", proof.fullReportHash);
  console.log("publicReportHash:", proof.publicReportHash);
  console.log("promptHash:", proof.promptHash);
  console.log("redactionPolicyHash:", proof.redactionPolicyHash);
  console.log("metadataHash:", proof.metadataHash);
  console.log("rawSnapshotStorageRoot:", proof.rawSnapshotStorageRoot);
  console.log("fullReportStorageRoot:", proof.fullReportStorageRoot);
  console.log("publicReportStorageRoot:", proof.publicReportStorageRoot);
  console.log("metadataStorageRoot:", proof.metadataStorageRoot);
  console.log("modelId:", proof.modelId);
  console.log("computeMode:", proof.computeMode);
  console.log("note:", proof.note);
  console.log("creator:", proof.creator);
  console.log("createdAt:", proof.createdAt.toString());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
