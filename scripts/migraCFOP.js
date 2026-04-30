// Executa uma vez: atualiza CFOPs no Firestore config/categoriasTributarias
// Uso: node scripts/migraCFOP.js
const admin = require('../functions/node_modules/firebase-admin');

const serviceAccount = require('../functions/service-account.json');
// se não tiver service-account.json, usa credencial padrão (GOOGLE_APPLICATION_DEFAULT)
if (!admin.apps.length) {
  try {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } catch {
    admin.initializeApp({ credential: admin.credential.applicationDefault(),
      projectId: 'pedidos-joey' });
  }
}

const db = admin.firestore();
const PATCH = {
  'Pizza':  { cfop: '5101' },
  'Burger': { cfop: '5101' },
  'Porção': { cfop: '5101' },
  'Outro':  { cfop: '5101' },
  'Bebida': { cfop: '5405' },
};

async function run() {
  const ref  = db.doc('config/categoriasTributarias');
  const snap = await ref.get();
  const data = snap.exists ? snap.data() : {};

  const updated = { ...data };
  for (const [cat, patch] of Object.entries(PATCH)) {
    updated[cat] = { ...(data[cat] || {}), ...patch };
  }

  await ref.set(updated);
  console.log('config/categoriasTributarias atualizado:');
  for (const [cat, v] of Object.entries(updated)) {
    console.log(' ', cat, '→ cfop:', v.cfop);
  }
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
