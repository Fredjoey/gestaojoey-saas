const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert('./serviceAccount-gestaojoey.json') });
const db = admin.firestore();

async function main() {
  const inicio = new Date('2026-05-07T00:00:00-03:00');
  const fim = new Date('2026-05-08T00:00:00-03:00');

  const snap = await db.collection('clientes/joey/pedidos')
    .where('criadoEm', '>=', inicio)
    .where('criadoEm', '<', fim)
    .get();

  console.log(`📦 ${snap.size} pedidos em 07/05/2026`);
  snap.docs.forEach(doc => {
    const d = doc.data();
    console.log(`- ${doc.id} | ${d.cliente?.nome || 'sem nome'} | R$ ${d.valorTotal || d.total || '?'} | status: ${d.status} | criadoEm: ${d.criadoEm?.toDate?.() || d.criadoEm}`);
  });

  // Também conta o total geral
  const total = await db.collection('clientes/joey/pedidos').get();
  console.log(`\n📊 Total de pedidos na coleção: ${total.size}`);

  process.exit(0);
}
main().catch(e => { console.error('❌', e); process.exit(1); });
