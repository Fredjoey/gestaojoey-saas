const admin = require('firebase-admin');
const app = admin.initializeApp({ credential: admin.credential.cert('./serviceAccount-pedidos-joey.json') });
const db = app.firestore();

async function main() {
  // Pedidos de hoje (08/05/2026) ainda no projeto antigo?
  const ini = new Date('2026-05-08T00:00:00-03:00').getTime();
  const fim = new Date('2026-05-09T00:00:00-03:00').getTime();
  const snap = await db.collection('pedidos').where('ts', '>=', ini).where('ts', '<', fim).get();
  console.log(`📅 pedidos de 08/05 ainda em pedidos-joey: ${snap.size}`);

  // Total na coleção raiz
  const total = await db.collection('pedidos').get();
  console.log(`📊 total de pedidos na raiz pedidos-joey: ${total.size}`);

  // ts mais recente
  const recente = await db.collection('pedidos').orderBy('ts', 'desc').limit(1).get();
  if (!recente.empty) {
    const d = recente.docs[0].data();
    console.log(`⏱️  ts mais recente: ${new Date(d.ts).toISOString()} (id ${recente.docs[0].id})`);
  }
  process.exit(0);
}
main().catch(e => { console.error('❌', e); process.exit(1); });
