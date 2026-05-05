import './style.css';

const tradeRecord = {
  recordId: 'TR-001',
  industry: 'NTC Thermistor Export Trade',
  product: 'NTC Thermistor Sensor',
  model: 'MF59A',
  clientCountry: 'Germany',
  quantity: '50,000 pcs',
  status: 'Sample / quotation record',
  dataType: 'Structured trade data snapshot',
};

const storageProof = {
  network: '0G Galileo Testnet',
  rootHash: '0x2744b0eb8f5fbe46f1c4c156cdac03c07d4e929ffb24b9cd9dcd6150908f599a',
  txHash: '0x068e7250f7dcdf9648b97bf9f35197869e6c7022f2a58bdc850a70bc0b866d28',
  explorer: 'https://chainscan-galileo.0g.ai/tx/',
};

const whyCards = [
  {
    title: 'Why not just a database?',
    text: 'A normal database is great for daily operations, but it is controlled by one company or one organization. Trade records that may be used across clients, factories, and future AI agents need a more neutral data layer.',
  },
  {
    title: 'Why not just AWS or cloud storage?',
    text: 'Cloud storage is convenient, but it creates vendor lock-in and depends on one centralized provider. For long-term business data snapshots, decentralized storage gives stronger portability and openness.',
  },
  {
    title: 'Why not store everything on-chain?',
    text: 'Full on-chain storage is too expensive and inefficient for business files. 0G Storage allows large data to stay off-chain while keeping a verifiable root hash and transaction proof.',
  },
  {
    title: 'Why 0G?',
    text: '0G is designed for high-throughput decentralized storage and AI-era data workflows. In this demo, a real-world trade record becomes a verifiable data snapshot that can later be used by AI agents, auditors, or cross-organization workflows.',
  },
];

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing #app element');
}

app.innerHTML = `
  <main class="page">
    <section class="hero">
      <div>
        <p class="eyebrow">TradeProof on 0G</p>
        <h1>Verifiable trade data snapshots for the AI infrastructure era.</h1>
        <p class="hero-text">
          This minimal dapp stores a structured export trade record on 0G Storage,
          using real-world NTC thermistor business data as the demo scenario.
        </p>
      </div>
      <div class="hero-badge">
        <span>Built with</span>
        <strong>0G Storage</strong>
      </div>
    </section>

    <section class="grid two-cols">
      <article class="card">
        <div class="card-header">
          <span class="icon">📦</span>
          <div>
            <h2>Trade Record Preview</h2>
            <p>A structured business data snapshot before storage.</p>
          </div>
        </div>

        <div class="record-list">
          ${Object.entries(tradeRecord)
            .map(
              ([key, value]) => `
                <div class="record-row">
                  <span>${formatLabel(key)}</span>
                  <strong>${value}</strong>
                </div>
              `
            )
            .join('')}
        </div>
      </article>

      <article class="card proof-card">
        <div class="card-header">
          <span class="icon">🔐</span>
          <div>
            <h2>0G Storage Proof</h2>
            <p>The uploaded file can be retrieved by its root hash.</p>
          </div>
        </div>

        <div class="proof-list">
          <div>
            <span>Network</span>
            <code>${storageProof.network}</code>
          </div>
          <div>
            <span>Root Hash</span>
            <code>${storageProof.rootHash}</code>
          </div>
          <div>
            <span>Tx Hash</span>
            <code>${storageProof.txHash}</code>
          </div>
        </div>

        <a class="proof-link" href="${storageProof.explorer}" target="_blank" rel="noreferrer">
          View transaction on explorer →
        </a>
      </article>
    </section>

    <section class="card">
      <div class="card-header">
        <span class="icon">🧠</span>
        <div>
          <h2>Why use 0G for this demo?</h2>
          <p>This demo is not about putting every business record on decentralized storage. It is about choosing the right data layer for records that need long-term availability, neutrality, and verifiability.</p>
        </div>
      </div>

      <div class="why-grid">
        ${whyCards
          .map(
            (card) => `
              <div class="why-card">
                <h3>${card.title}</h3>
                <p>${card.text}</p>
              </div>
            `
          )
          .join('')}
      </div>
    </section>

    <section class="card next-card">
      <h2>Next step</h2>
      <p>
        The next version can add wallet connection, browser upload, encrypted trade records,
        and an AI-agent-readable metadata layer for export workflows.
      </p>
    </section>
  </main>
`;

function formatLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (char) => char.toUpperCase());
}
EOFcat > web/src/main.ts <<'EOF'
