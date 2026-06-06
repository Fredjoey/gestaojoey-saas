const admin = require('firebase-admin');

const origem = admin.initializeApp({
  credential: admin.credential.cert('./serviceAccount-pedidos-joey.json')
}, 'origem');

const destino = admin.initializeApp({
  credential: admin.credential.cert('./serviceAccount-gestaojoey.json')
}, 'destino');

const dbOrigem = origem.firestore();
const dbDestino = destino.firestore();

async function main() {
  // Lista pedidos de 07/05 no projeto antigo
  const inicio = new Date('2026-05-07T00:00:00-03:00').getTime();
  const fim = new Date('2026-05-08T00:00:00-03:00').getTime();

  const snap = await dbOrigem.collection('pedidos').where('ts', '>=', inicio).where('ts', '<', fim).get();
  console.log(`📦 ${snap.size} pedidos de 07/05 no pedidos-joey`);

  if (snap.empty) { process.exit(0); }

  // Migra para gestaojoey/clientes/joey/pedidos
  let batch = dbDestino.batch(), count = 0;
  for (const doc of snap.docs) {
    batch.set(dbDestino.doc(`clientes/joey/pedidos/${doc.id}`), doc.data());
    count++;
  }
  await batch.commit();
  console.log(`✅ ${count} pedidos migrados`);
  process.exit(0);
}
main().catch(e => { console.error('❌', e); process.exit(1); });
