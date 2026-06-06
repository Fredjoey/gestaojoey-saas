const admin = require('firebase-admin');

admin.initializeApp({
  credential: admin.credential.cert('./serviceAccount-pedidos-joey.json')
});

const db = admin.firestore();

async function main() {
  const inicio = new Date('2026-05-07T00:00:00-03:00').getTime();
  const fim = new Date('2026-05-08T00:00:00-03:00').getTime();

  const snap = await db.collection('pedidos').where('ts', '>=', inicio).where('ts', '<', fim).get();
  console.log(`📦 ${snap.size} pedidos duplicados de 07/05 encontrados em pedidos-joey`);

  if (snap.empty) { process.exit(0); }

  let batch = db.batch(), count = 0;
  for (const doc of snap.docs) {
    batch.delete(doc.ref);
    count++;
  }
  await batch.commit();
  console.log(`✅ ${count} pedidos duplicados deletados de pedidos-joey`);
  console.log(`📊 Mantidos os 159 pedidos antigos como backup`);
  process.exit(0);
}
main().catch(e => { console.error('❌', e); process.exit(1); });
