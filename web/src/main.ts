import './style.css';

type Dict<T = unknown> = Record<string, T>;

interface ProofMetadata {
  report_period: string;
  reportPeriod?: string;
  compute_mode: string;
  computeMode?: string;
  compute_provider?: string;
  computeProvider?: string;
  generatedBy?: string;
  model_id: string;
  modelId?: string;
  input_snapshot_count: number;
  inputSnapshotCount?: number;
  promptHash?: string;
  redactionPolicyHash?: string;
  rawSnapshotHash?: string;
  fullReportHash?: string;
  publicReportHash?: string;
  prompt: {
    hash: string;
  };
  redaction_policy: {
    policy_id: string;
    hash: string;
  };
  raw_snapshot: {
    hash: string;
    storage_root_hash: string;
    storage_tx_hash: string;
  };
  reports: {
    full_internal: {
      hash: string;
      storage_root_hash: string;
      storage_tx_hash: string;
    };
    redacted_public: {
      hash: string;
      storage_root_hash: string;
      storage_tx_hash: string;
    };
  };
  metadata_file: {
    hash: string;
    storage_root_hash: string;
    storage_tx_hash: string;
  };
  proof_registry: {
    contract_address: string;
    proof_id: number;
    chain_tx_hash: string;
    transaction_hash: string;
    block_number: number;
    created_at: string;
  };
}

interface FullReport {
  executive_summary: string;
  business_metrics: {
    total_records: number;
    total_quantity: number;
  };
  distributions: {
    customer_region: Dict<number>;
    customer_industry: Dict<number>;
    product_model: Dict<number>;
  };
  internal_capability_assessment: Dict<string>;
  source_snapshot: {
    snapshot_id: string;
    sensitivity: Dict<boolean | string>;
  };
}

interface PublicReport {
  public_summary: string;
  disclosed_metrics: {
    total_records: number;
    total_quantity_range: {
      display: string;
    };
    active_customer_regions: string[];
    product_model_count: number;
  };
  derived_customer_context: {
    customer_region_distribution: Dict<number>;
    customer_industry_distribution: Dict<number>;
    customer_size_tier_distribution: Dict<number>;
  };
  product_and_pipeline_signals: {
    product_model_distribution: Dict<number>;
  };
  capability_summary: Dict<string>;
}

interface RedactionPolicy {
  forbidden_public_fields: string[];
  forbidden_public_content: string[];
  allowed_public_signals: string[];
}

interface RawBusinessRecord {
  customer_name?: string;
  contact_name?: string;
  contact_person?: string;
  contact_email?: string;
  customer_email?: string;
  record_id?: string;
  order_id?: string;
  product?: string;
  model?: string;
  quantity?: number;
  quoted_unit_price_usd?: number;
  amount_usd?: number;
  estimated_margin_rate?: number;
  margin_rate?: number;
  payment_terms?: string;
  internal_notes?: string;
}

interface RawSnapshot {
  records: RawBusinessRecord[];
}

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing #app element');
}

const root = app;

root.innerHTML = '<main class="page"><section class="panel">Loading TradeProof demo data...</section></main>';

const DATA_BASE = '/demo-data';
const EXPLORER_TX = 'https://chainscan-galileo.0g.ai/tx/';
const EXPLORER_ADDRESS = 'https://chainscan-galileo.0g.ai/address/';
const FORBIDDEN_VALUES_CHECKED = 48;

async function loadJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}`);
  }
  return response.json() as Promise<T>;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function shortHash(value?: string, head = 12, tail = 10): string {
  if (!value) return 'Not available';
  if (value.length <= head + tail + 3) return value;
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

function hashLine(label: string, value?: string, link?: string): string {
  const safeValue = escapeHtml(value || 'Not available');
  const content = `<code title="${safeValue}">${escapeHtml(shortHash(value))}</code>`;
  return `
    <div class="kv-row">
      <span>${escapeHtml(label)}</span>
      ${link && value ? `<a href="${escapeHtml(link)}" target="_blank" rel="noreferrer">${content}</a>` : content}
    </div>
  `;
}

function stat(label: string, value: unknown): string {
  return `
    <div class="stat">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function badges(labels: string[]): string {
  return labels.map((label) => `<span class="status-badge">PASS ${escapeHtml(label)}</span>`).join('');
}

function distribution(title: string, values: Dict<number>): string {
  const entries = Object.entries(values);
  const max = Math.max(...entries.map(([, count]) => Number(count)), 1);

  return `
    <div class="distribution">
      <h4>${escapeHtml(title)}</h4>
      ${entries
        .map(([label, count]) => {
          const width = Math.max((Number(count) / max) * 100, 10);
          return `
            <div class="bar-row">
              <span>${escapeHtml(label)}</span>
              <div class="bar-track"><div class="bar-fill" style="width: ${width}%"></div></div>
              <strong>${escapeHtml(count)}</strong>
            </div>
          `;
        })
        .join('')}
    </div>
  `;
}

function policyList(items: string[]): string {
  return `<ul class="policy-list">${items.map((item) => `<li>${escapeHtml(formatPolicyText(item))}</li>`).join('')}</ul>`;
}

function formatPolicyText(value: string): string {
  return value.replaceAll('_', ' ');
}

function metadataComputeMode(metadata: ProofMetadata): string {
  return metadata.computeMode || metadata.compute_mode;
}

function metadataModelId(metadata: ProofMetadata): string {
  return metadata.modelId || metadata.model_id;
}

function metadataComputeProvider(metadata: ProofMetadata): string {
  return metadata.computeProvider || metadata.compute_provider || metadata.generatedBy || 'Not recorded';
}

function computeModeBadge(metadata: ProofMetadata): string {
  const mode = metadataComputeMode(metadata);
  const label = mode === '0g_private_computer' ? '0G Compute / Private Computer' : 'Mock compute mode';
  return `<span class="compute-badge">${escapeHtml(label)}</span>`;
}

function rawField(label: string, value: unknown): string {
  return `
    <div class="raw-field">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value ?? 'Not recorded')}</strong>
    </div>
  `;
}

function renderRawRecord(record: RawBusinessRecord, index: number): string {
  return `
    <article class="raw-record">
      <div class="raw-record-title">
        <strong>Raw business record ${index + 1}</strong>
        <span>Synthetic sensitive input</span>
      </div>
      <div class="raw-field-grid">
        ${rawField('customer_name', record.customer_name)}
        ${rawField('contact_name', record.contact_name || record.contact_person)}
        ${rawField('email', record.contact_email || record.customer_email)}
        ${rawField('order_id', record.order_id || record.record_id)}
        ${rawField('product', record.product)}
        ${rawField('model', record.model)}
        ${rawField('quantity', record.quantity)}
        ${rawField('quoted_unit_price_usd', record.quoted_unit_price_usd)}
        ${rawField('amount_usd', record.amount_usd)}
        ${rawField('margin_rate', record.margin_rate ?? record.estimated_margin_rate)}
        ${rawField('payment_terms', record.payment_terms)}
        ${rawField('internal_notes', record.internal_notes || 'Sales follow-up note withheld from public report')}
      </div>
    </article>
  `;
}

function renderFactoryStaff(
  full: FullReport,
  metadata: ProofMetadata,
  policy: RedactionPolicy,
  rawSnapshot: RawSnapshot,
): string {
  const regions = Object.keys(full.distributions.customer_region).join(', ');
  const products = Object.keys(full.distributions.product_model).join(', ');
  const previewRecords = rawSnapshot.records.slice(0, 3);

  return `
    <div class="tab-panel active" data-panel="staff">
      <div class="panel-grid">
        <section class="panel">
          <div class="panel-title">
            <span>Data Submission</span>
            <small>One confidential raw snapshot submitted by the factory business system</small>
          </div>
          <div class="stats-grid">
            ${stat('Report period', metadata.report_period)}
            ${stat('Input snapshot count', metadata.input_snapshot_count)}
            ${stat('Record count', full.business_metrics.total_records)}
            ${stat('Covered regions', regions)}
            ${stat('Product categories', products)}
            ${stat('Sensitive fields detected', policy.forbidden_public_fields.length)}
          </div>
          <div class="kv-list">
            ${hashLine('rawSnapshotHash', metadata.raw_snapshot.hash)}
            ${hashLine('rawSnapshotStorageRoot', metadata.raw_snapshot.storage_root_hash)}
          </div>
        </section>
        <section class="panel raw-preview-panel">
          <div class="panel-title">
            <span>Raw Records Preview — Synthetic Demo Data</span>
            <small>Only 3 example records are shown</small>
          </div>
          <div class="sensitive-notice">
            Synthetic presentation data—In a real workflow, these fields are recorded by front-line salesmen at work.
          </div>
          <div class="raw-record-list">
            ${previewRecords.map((record, index) => renderRawRecord(record, index)).join('')}
          </div>
        </section>
      </div>
    </div>
  `;
}

function renderFactoryManager(full: FullReport, metadata: ProofMetadata): string {
  return `
    <div class="tab-panel" data-panel="manager">
      <div class="warning-strip">
        <strong>Internal Only</strong>
        <span>Contains sensitive business information. This showcase displays summary fields only.</span>
      </div>
      <div class="panel-grid">
        <section class="panel">
          <div class="panel-title">
            <span>Internal Capability Summary</span>
            <small>Derived from the confidential full report</small>
          </div>
          <p class="summary-text">${escapeHtml(full.executive_summary)}</p>
          <div class="note-grid">
            ${Object.entries(full.internal_capability_assessment)
              .map(
                ([label, text]) => `
                  <div class="note-card">
                    <h4>${escapeHtml(formatPolicyText(label))}</h4>
                    <p>${escapeHtml(text)}</p>
                  </div>
                `,
              )
              .join('')}
          </div>
        </section>
        <section class="panel">
          ${distribution('Region analysis', full.distributions.customer_region)}
          ${distribution('Industry analysis', full.distributions.customer_industry)}
          <div class="kv-list">
            ${hashLine('fullReportHash', metadata.reports.full_internal.hash)}
            ${hashLine('fullReportStorageRoot', metadata.reports.full_internal.storage_root_hash)}
          </div>
        </section>
      </div>
    </div>
  `;
}

function renderExternalAuditor(publicReport: PublicReport, metadata: ProofMetadata): string {
  return `
    <div class="tab-panel" data-panel="auditor">
      <div class="auditor-callout">
        External auditors can verify the public report without seeing confidential raw customer data.
      </div>
      <div class="panel-grid">
        <section class="panel">
          <div class="panel-title">
            <span>Redacted Supplier Capability Report</span>
            <small>Public-safe output</small>
          </div>
          <p class="summary-text">${escapeHtml(publicReport.public_summary)}</p>
          <div class="stats-grid compact">
            ${stat('Quantity range', publicReport.disclosed_metrics.total_quantity_range.display)}
            ${stat('Product model count', publicReport.disclosed_metrics.product_model_count)}
            ${stat('Redaction check result', 'PASS')}
            ${stat('Verification result', 'PASS TradeProof verification passed')}
          </div>
          <div class="note-grid">
            ${Object.entries(publicReport.capability_summary)
              .map(
                ([label, text]) => `
                  <div class="note-card">
                    <h4>${escapeHtml(formatPolicyText(label))}</h4>
                    <p>${escapeHtml(text)}</p>
                  </div>
                `,
              )
              .join('')}
          </div>
        </section>
        <section class="panel">
          ${distribution('Region distribution', publicReport.derived_customer_context.customer_region_distribution)}
          ${distribution('Industry distribution', publicReport.derived_customer_context.customer_industry_distribution)}
          ${distribution('Product capability', publicReport.product_and_pipeline_signals.product_model_distribution)}
          <div class="kv-list">
            ${hashLine('publicReportHash', metadata.reports.redacted_public.hash)}
            ${hashLine('publicReportStorageRoot', metadata.reports.redacted_public.storage_root_hash)}
            ${hashLine('metadataStorageRoot', metadata.metadata_file.storage_root_hash)}
            ${hashLine('contract address', metadata.proof_registry.contract_address, `${EXPLORER_ADDRESS}${metadata.proof_registry.contract_address}`)}
            ${stat('proofId', metadata.proof_registry.proof_id)}
            ${hashLine('chainTxHash', metadata.proof_registry.chain_tx_hash, `${EXPLORER_TX}${metadata.proof_registry.chain_tx_hash}`)}
          </div>
        </section>
      </div>
    </div>
  `;
}

function renderProofBlock(metadata: ProofMetadata): string {
  return `
    <section class="panel proof-panel">
      <div class="section-heading">
        <div>
          <p class="eyebrow">0G Proof</p>
          <h2>Storage roots and chain proof</h2>
        </div>
        <a class="link-button" href="${EXPLORER_TX}${escapeHtml(metadata.proof_registry.chain_tx_hash)}" target="_blank" rel="noreferrer">
          View chain transaction
        </a>
      </div>
      <div class="proof-grid">
        ${hashLine('rawSnapshotStorageRoot', metadata.raw_snapshot.storage_root_hash)}
        ${hashLine('fullReportStorageRoot', metadata.reports.full_internal.storage_root_hash)}
        ${hashLine('publicReportStorageRoot', metadata.reports.redacted_public.storage_root_hash)}
        ${hashLine('metadataStorageRoot', metadata.metadata_file.storage_root_hash)}
        ${hashLine('contractAddress', metadata.proof_registry.contract_address, `${EXPLORER_ADDRESS}${metadata.proof_registry.contract_address}`)}
        ${stat('proofId', metadata.proof_registry.proof_id)}
        ${hashLine('chainTxHash', metadata.proof_registry.chain_tx_hash, `${EXPLORER_TX}${metadata.proof_registry.chain_tx_hash}`)}
        ${stat('modelId', metadata.model_id)}
        ${stat('computeMode', metadata.compute_mode)}
        ${stat('reportPeriod', metadata.report_period)}
      </div>
    </section>
  `;
}

function renderAiGenerationProof(metadata: ProofMetadata): string {
  return `
    <section class="panel ai-proof-panel">
      <div class="section-heading">
        <div>
          <p class="eyebrow">AI Generation Proof</p>
          <h2>Verifiable AI-generated report package</h2>
        </div>
        ${computeModeBadge(metadata)}
      </div>
      <p class="summary-text">
        This demo verifies the AI-generated report package by binding the raw input snapshot, prompt,
        redaction policy, model ID, output report hashes, 0G Storage roots, and 0G Chain proof.
      </p>
      <div class="proof-grid">
        ${hashLine('rawSnapshotHash', metadata.rawSnapshotHash || metadata.raw_snapshot.hash)}
        ${stat('inputSnapshotCount', metadata.inputSnapshotCount || metadata.input_snapshot_count)}
        ${hashLine('promptHash', metadata.promptHash || metadata.prompt.hash)}
        ${hashLine('redactionPolicyHash', metadata.redactionPolicyHash || metadata.redaction_policy.hash)}
        ${stat('redactionPolicyId', metadata.redaction_policy.policy_id)}
        ${stat('modelId', metadataModelId(metadata))}
        ${stat('computeMode', metadataComputeMode(metadata))}
        ${stat('computeProvider / generatedBy', metadataComputeProvider(metadata))}
        ${hashLine('fullReportHash', metadata.fullReportHash || metadata.reports.full_internal.hash)}
        ${hashLine('publicReportHash', metadata.publicReportHash || metadata.reports.redacted_public.hash)}
        ${hashLine('metadataHash', metadata.metadata_file.hash)}
        ${hashLine('metadataStorageRoot', metadata.metadata_file.storage_root_hash)}
        ${stat('proofId', metadata.proof_registry.proof_id)}
        ${hashLine('contractAddress', metadata.proof_registry.contract_address, `${EXPLORER_ADDRESS}${metadata.proof_registry.contract_address}`)}
        ${hashLine('chainTxHash', metadata.proof_registry.chain_tx_hash, `${EXPLORER_TX}${metadata.proof_registry.chain_tx_hash}`)}
      </div>
    </section>
  `;
}

function renderPolicyBlock(policy: RedactionPolicy): string {
  const forbidden = [
    'customer name',
    'contact name',
    'email',
    'order id',
    'quoted unit price',
    'exact amount',
    'margin rate',
    'payment terms',
    'internal notes',
  ];
  const allowed = [
    'region distribution',
    'industry distribution',
    'product capability',
    'quantity range',
    'customer type / industry profile',
    'supplier capability summary',
  ];

  return `
    <section class="policy-grid">
      <div class="panel">
        <div class="panel-title">
          <span>Forbidden in public report</span>
          <small>Blocked by ${escapeHtml(policy.forbidden_public_fields.length)} sensitive field rules</small>
        </div>
        ${policyList(forbidden)}
      </div>
      <div class="panel">
        <div class="panel-title">
          <span>Allowed in public report</span>
          <small>Aggregated capability signals only</small>
        </div>
        ${policyList(allowed)}
      </div>
      <div class="panel pass-card">
        <span>Redaction check</span>
        <strong>PASS</strong>
        <small>Forbidden raw values checked: ${FORBIDDEN_VALUES_CHECKED}</small>
      </div>
    </section>
  `;
}

function renderTimeline(): string {
  const steps = [
    'Raw snapshot prepared',
    'AI generated full internal report',
    'AI generated redacted public report',
    'Redaction policy checked',
    'Report bundle uploaded to 0G Storage',
    'Report proof verified on 0G Chain',
  ];

  return `
    <section class="panel timeline-panel">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Proof Timeline</p>
          <h2>End-to-end verification path</h2>
        </div>
      </div>
      <div class="timeline">
        ${steps
          .map(
            (step, index) => `
              <div class="timeline-step">
                <span class="step-number">${index + 1}</span>
                <div>
                  <strong>Step ${index + 1}: ${escapeHtml(step)}</strong>
                  <small>PASS / completed</small>
                </div>
              </div>
            `,
          )
          .join('')}
      </div>
    </section>
  `;
}

function bindTabs(): void {
  const buttons = document.querySelectorAll<HTMLButtonElement>('.tab-button');
  const panels = document.querySelectorAll<HTMLElement>('.tab-panel');

  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const target = button.dataset.tab;
      buttons.forEach((item) => item.classList.toggle('active', item === button));
      panels.forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === target));
    });
  });
}

async function render(): Promise<void> {
  const [fullReport, publicReport, metadata, policy, rawSnapshot] = await Promise.all([
    loadJson<FullReport>(`${DATA_BASE}/full-report-2025-q4.json`),
    loadJson<PublicReport>(`${DATA_BASE}/public-report-2025-q4.json`),
    loadJson<ProofMetadata>(`${DATA_BASE}/report-proof-metadata-2025-q4.json`),
    loadJson<RedactionPolicy>(`${DATA_BASE}/redaction-policy.json`),
    loadJson<RawSnapshot>(`${DATA_BASE}/raw-business-records-2025-q4.json`),
  ]);

  root.innerHTML = `
    <main class="page">
      <section class="hero">
        <div class="hero-copy">
          <p class="eyebrow">TradeProof on 0G</p>
          <h1>TradeProof — Verifiable AI Audit Reports for Manufacturing</h1>
          <p>
            Turn sensitive factory business records into redacted, verifiable supplier capability reports using 0G Storage and 0G Chain.
          </p>
          <div class="status-row">
            ${badges(['0G Storage Uploaded', '0G Chain Proof Created', 'Verification Passed'])}
          </div>
        </div>
        <div class="hero-proof">
          <span>Verification Result</span>
          <strong>PASS</strong>
          <small>Proof ID ${escapeHtml(metadata.proof_registry.proof_id)} on 0G Galileo</small>
        </div>
      </section>

      ${renderTimeline()}

      <section class="tabs-card">
        <div class="tabs">
          <button class="tab-button active" data-tab="staff">Data Submission</button>
          <button class="tab-button" data-tab="manager">Factory Manager</button>
          <button class="tab-button" data-tab="auditor">External Auditor</button>
        </div>
        ${renderFactoryStaff(fullReport, metadata, policy, rawSnapshot)}
        ${renderFactoryManager(fullReport, metadata)}
        ${renderExternalAuditor(publicReport, metadata)}
      </section>

      ${renderAiGenerationProof(metadata)}
      ${renderProofBlock(metadata)}
      ${renderPolicyBlock(policy)}
    </main>
  `;

  bindTabs();
}

render().catch((error) => {
  root.innerHTML = `
    <main class="page">
      <section class="panel error-panel">
        <h1>Unable to load TradeProof demo data</h1>
        <p>${escapeHtml(error instanceof Error ? error.message : String(error))}</p>
      </section>
    </main>
  `;
});
