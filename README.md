# TradeProof Capability Report on 0G

TradeProof is a CLI-first demo for manufacturing business capability verification on 0G Storage and 0G Chain.

The scenario: an NTC thermistor factory's internal business system generates one confidential quarterly raw snapshot. AI reads that single sensitive snapshot and generates two reports:

1. Full Internal Report for company decision-making.
2. Redacted Public Report for customers or third-party factory auditors.

The public report is not generated from a separate sanitized snapshot. AI receives the confidential input, then removes or aggregates sensitive information during report generation.

## Hackathon Links

- Demo URL: https://tradeproof-ai-audit-0g-rm13199ck-yvonne-xiao.vercel.app/
- Thumbnail URL: https://raw.githubusercontent.com/weiyuwu47-pixel/tradeproof-ai-audit-0g/main/web/public/cover.png
- Repository: https://github.com/weiyuwu47-pixel/tradeproof-ai-audit-0g

The deployed frontend is a static showcase. It reads only public demo artifacts from `web/public/demo-data/`; it does not read `.env`, private keys, or compute API keys.

## Flow

```text
raw confidential snapshot
  -> full internal report + redacted public report
  -> proof metadata / hashes
  -> upload raw + full + public + metadata to 0G Storage
  -> write storage roots and tx hashes back to metadata
  -> deploy TradeProofRegistry to 0G Chain
  -> create on-chain report proof from metadata
  -> read on-chain proof
  -> verify public report + redaction + metadata + on-chain proof
  -> PASS
```

## Setup

```bash
npm install
cp .env.example .env
```

Fill `.env` without committing it:

```env
REPORT_PERIOD=2025-Q4

PRIVATE_KEY=
OG_RPC_URL=https://evmrpc-testnet.0g.ai
OG_CHAIN_ID=16602
TRADE_PROOF_REGISTRY_ADDRESS=

OG_STORAGE_RPC=https://evmrpc-testnet.0g.ai
OG_STORAGE_INDEXER_RPC=https://indexer-storage-testnet-turbo.0g.ai

OG_COMPUTE_API_KEY=
OG_COMPUTE_BASE_URL=https://router-api.0g.ai/v1
OG_COMPUTE_MODEL=0GM-1.0-35B-A3B
```

Leave `OG_COMPUTE_API_KEY` empty for the deterministic local mock generator. `OG_COMPUTE_MODEL` is only used by `npm run report:generate:0g`.

## Optional: Generate Reports With Real 0G Compute

Mock report generation remains the default:

```bash
npm run report:generate
```

To generate reports with 0G Compute / Private Computer, fill these `.env` values:

```env
OG_COMPUTE_API_KEY=
OG_COMPUTE_BASE_URL=https://router-api.0g.ai/v1
OG_COMPUTE_MODEL=0GM-1.0-35B-A3B
```

Then run:

```bash
npm run report:generate:0g
npm run report:check-redaction
npm run report:upload
npm run proof:create
npm run proof:read
npm run proof:verify
npm run web:sync-demo-data
npm run web
```

If you regenerate reports with 0G Compute, report hashes change. You must upload the new report bundle and create a new chain proof; do not reuse an old `proofId` for newly generated reports.

## Local Verification

```bash
npm run demo:local
```

This runs:

```bash
npm run report:generate
npm run report:check-redaction
npm run proof:verify
```

Expected local result:

```text
Redaction check passed.
Local verification passed, on-chain proof not found in metadata.
PASS TradeProof verification passed.
```

## Real 0G Storage + 0G Chain Flow

1. Generate reports and metadata:

```bash
npm run report:generate
```

2. Confirm the public report does not leak forbidden sensitive values:

```bash
npm run report:check-redaction
```

3. Upload the report bundle to 0G Storage:

```bash
npm run report:upload
```

This uploads:

- `data/raw-business-records-2025-q4.json`
- `data/full-report-2025-q4.json`
- `data/public-report-2025-q4.json`
- `data/report-proof-metadata-2025-q4.json`

The script persists every storage root, tx hash, and uploaded timestamp back into `data/report-proof-metadata-2025-q4.json`.

4. First time only, deploy the proof registry:

```bash
npm run proof:deploy
```

The deploy script prints:

```text
TradeProofRegistry deployed to: 0x...
Add this to .env:
TRADE_PROOF_REGISTRY_ADDRESS=0x...
```

Copy that address into `.env`.

5. Create the on-chain report proof:

```bash
npm run proof:create
```

This reads `data/report-proof-metadata-2025-q4.json`, requires real Storage roots to be present, writes the proof to `TradeProofRegistry`, and writes `proof_id`, transaction hash, contract address, block number, and local created timestamp back to metadata.

6. Read the on-chain proof:

```bash
npm run proof:read
```

7. Verify public report + metadata + on-chain proof:

```bash
npm run proof:verify
```

Expected final result:

```text
OK public report hash: 0x...
OK redaction check
OK chain public report hash: 0x...
OK chain metadata storage root: 0x...
PASS TradeProof verification passed.
```

After the first deploy, you can run the full on-chain flow with the existing registry:

```bash
npm run demo:onchain
```

`demo:onchain` intentionally does not deploy a new contract, because redeploying every demo run would waste testnet gas.

## Commands

- `npm run report:generate`
- `npm run report:generate:0g`
- `npm run report:check-redaction`
- `npm run report:upload`
- `npm run proof:deploy`
- `npm run proof:create`
- `npm run proof:read`
- `npm run proof:verify`
- `npm run demo:local`
- `npm run demo:onchain`
- `npm run web:sync-demo-data`

## Frontend Showcase

The lightweight dashboard in `web/` is display-only. It does not upload files, deploy contracts, create proofs, read `.env`, or handle private keys.

It reads static demo artifacts from `web/public/demo-data/`:

- `full-report-2025-q4.json`
- `public-report-2025-q4.json`
- `report-proof-metadata-2025-q4.json`
- `redaction-policy.json`
- `raw-business-records-2025-q4.json`

Refresh those files from the CLI outputs before recording a new demo video:

```bash
npm run web:sync-demo-data
```

Start the page:

```bash
npm run web
```

Build the static frontend for Vercel:

```bash
npm run web:build
```

When deploying from the repository root, Vercel uses `vercel.json`:

- Build Command: `npm run web:build`
- Output Directory: `web/dist`
- Install Command: `npm install && cd web && npm install`

## Proof Model

`TradeProofRegistry` stores a report package proof:

- `reportPeriod`
- `rawSnapshotHash`
- `fullReportHash`
- `publicReportHash`
- `promptHash`
- `redactionPolicyHash`
- `metadataHash`
- `rawSnapshotStorageRoot`
- `fullReportStorageRoot`
- `publicReportStorageRoot`
- `metadataStorageRoot`
- `modelId`
- `computeMode`
- `creator`
- `createdAt`

External customers can verify the redacted public report without seeing the confidential raw snapshot. Authorized auditors can additionally receive the raw snapshot and verify `rawSnapshotHash`.

## Security

- Do not commit `.env`.
- Do not paste real `PRIVATE_KEY` or `OG_COMPUTE_API_KEY` into code or README.
- Scripts print public addresses, hashes, roots, and transaction hashes only.
- `.gitignore` excludes `.env`, `*.local`, private key-like files, and `secrets/`.
