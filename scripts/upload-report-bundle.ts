import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { uploadFile, getConfig } from '../src/index.js';

const args = process.argv.slice(2);

function getArg(name: string, fallback?: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return fallback;
  return args[index + 1] || fallback;
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function writeJson(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function resolveFromRepo(relativeOrAbsolute: string): string {
  return path.isAbsolute(relativeOrAbsolute)
    ? relativeOrAbsolute
    : path.resolve(process.cwd(), relativeOrAbsolute);
}

interface ProofMetadata {
  report_period: string;
  raw_snapshot: {
    path: string;
    storage_root_hash: string | null;
    storage_tx_hash: string | null;
    uploaded_at?: string | null;
  };
  reports: {
    full_internal: {
      path: string;
      storage_root_hash: string | null;
      storage_tx_hash: string | null;
      uploaded_at?: string | null;
    };
    redacted_public: {
      path: string;
      storage_root_hash: string | null;
      storage_tx_hash: string | null;
      uploaded_at?: string | null;
    };
  };
  metadata_file?: {
    path: string;
    hash_algorithm: string;
    hash: string | null;
    storage_root_hash: string | null;
    storage_tx_hash: string | null;
    uploaded_at: string | null;
  };
  storage_bundle?: {
    uploaded_at: string;
    files: Record<string, {
      path: string;
      storage_root_hash: string;
      storage_tx_hash: string;
      uploaded_at: string;
    }>;
  };
}

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const objectValue = value as Record<string, unknown>;
    return `{${Object.keys(objectValue)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(objectValue[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Hex(value: unknown): string {
  const data = typeof value === 'string' ? value : canonicalize(value);
  return `0x${crypto.createHash('sha256').update(data).digest('hex')}`;
}

function metadataProofPayload(metadata: ProofMetadata): unknown {
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

const metadataPath = path.resolve(
  getArg(
    'metadata',
    path.join('data', `report-proof-metadata-${(process.env.REPORT_PERIOD || '2025-Q4').toLowerCase()}.json`),
  )!,
);
const network = getArg('network');
const mode = getArg('mode');
const privateKey = getArg('key');

async function uploadNamedFile(label: string, filePath: string) {
  console.log(`Uploading ${label}: ${filePath}`);
  const config = getConfig({ network, mode, privateKey });
  const result = await uploadFile(filePath, config);
  console.log(`  rootHash: ${result.rootHash}`);
  console.log(`  txHash:   ${result.txHash}`);
  console.log(`  explorer: ${config.network.explorerUrl}/tx/${result.txHash}`);
  return result;
}

async function main() {
  const metadata = readJson<ProofMetadata>(metadataPath);

  const period = metadata.report_period || process.env.REPORT_PERIOD || '2025-Q4';
  const rawPath = resolveFromRepo(metadata.raw_snapshot.path || `data/raw-business-records-${period.toLowerCase()}.json`);
  const fullPath = resolveFromRepo(metadata.reports.full_internal.path || `data/full-report-${period.toLowerCase()}.json`);
  const publicPath = resolveFromRepo(metadata.reports.redacted_public.path || `data/public-report-${period.toLowerCase()}.json`);

  const rawUpload = await uploadNamedFile('raw confidential snapshot', rawPath);
  metadata.raw_snapshot.storage_root_hash = rawUpload.rootHash;
  metadata.raw_snapshot.storage_tx_hash = rawUpload.txHash;
  metadata.raw_snapshot.uploaded_at = new Date().toISOString();

  const fullUpload = await uploadNamedFile('full internal report', fullPath);
  metadata.reports.full_internal.storage_root_hash = fullUpload.rootHash;
  metadata.reports.full_internal.storage_tx_hash = fullUpload.txHash;
  metadata.reports.full_internal.uploaded_at = new Date().toISOString();

  const publicUpload = await uploadNamedFile('redacted public report', publicPath);
  metadata.reports.redacted_public.storage_root_hash = publicUpload.rootHash;
  metadata.reports.redacted_public.storage_tx_hash = publicUpload.txHash;
  metadata.reports.redacted_public.uploaded_at = new Date().toISOString();

  metadata.storage_bundle = {
    uploaded_at: new Date().toISOString(),
    files: {
      raw_snapshot: {
        path: path.relative(process.cwd(), rawPath),
        storage_root_hash: rawUpload.rootHash,
        storage_tx_hash: rawUpload.txHash,
        uploaded_at: metadata.raw_snapshot.uploaded_at,
      },
      full_internal_report: {
        path: path.relative(process.cwd(), fullPath),
        storage_root_hash: fullUpload.rootHash,
        storage_tx_hash: fullUpload.txHash,
        uploaded_at: metadata.reports.full_internal.uploaded_at,
      },
      redacted_public_report: {
        path: path.relative(process.cwd(), publicPath),
        storage_root_hash: publicUpload.rootHash,
        storage_tx_hash: publicUpload.txHash,
        uploaded_at: metadata.reports.redacted_public.uploaded_at,
      },
    },
  };

  metadata.metadata_file = {
    path: path.relative(process.cwd(), metadataPath),
    hash_algorithm: 'sha256',
    hash: null,
    storage_root_hash: null,
    storage_tx_hash: null,
    uploaded_at: null,
  };

  metadata.metadata_file.hash = sha256Hex(metadataProofPayload(metadata));

  writeJson(metadataPath, metadata);

  const metadataUpload = await uploadNamedFile('proof metadata', metadataPath);
  const metadataUploadedAt = new Date().toISOString();
  metadata.metadata_file.storage_root_hash = metadataUpload.rootHash;
  metadata.metadata_file.storage_tx_hash = metadataUpload.txHash;
  metadata.metadata_file.uploaded_at = metadataUploadedAt;
  metadata.storage_bundle.files.metadata = {
    path: path.relative(process.cwd(), metadataPath),
    storage_root_hash: metadataUpload.rootHash,
    storage_tx_hash: metadataUpload.txHash,
    uploaded_at: metadataUploadedAt,
  };

  writeJson(metadataPath, metadata);

  console.log('');
  console.log('Report bundle uploaded successfully.');
  console.log('Updated metadata:', metadataPath);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
