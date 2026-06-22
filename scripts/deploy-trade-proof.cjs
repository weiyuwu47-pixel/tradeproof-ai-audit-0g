const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = await hre.ethers.provider.getNetwork();

  console.log("Deploying TradeProofRegistry...");
  console.log("RPC:", process.env.OG_RPC_URL || "https://evmrpc-testnet.0g.ai");
  console.log("Chain ID:", network.chainId.toString());
  console.log("Deployer address:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Deployer balance:", hre.ethers.formatEther(balance), "0G");

  const TradeProofRegistry = await hre.ethers.getContractFactory("TradeProofRegistry");
  const registry = await TradeProofRegistry.deploy();

  await registry.waitForDeployment();

  const address = await registry.getAddress();

  console.log("TradeProofRegistry deployed to:", address);
  console.log("Explorer:", `https://chainscan-galileo.0g.ai/address/${address}`);
  console.log("");
  console.log("Add this to .env:");
  console.log(`TRADE_PROOF_REGISTRY_ADDRESS=${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
