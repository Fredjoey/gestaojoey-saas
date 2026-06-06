const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert('./serviceAccount-gestaojoey.json') });
const db = admin.firestore();

async function main() {
  const snap = await db.collection('clientes/joey/notasFiscais')
    .orderBy('criadoEm', 'desc').limit(5).get();
  console.log(`📦 ${snap.size} notas fiscais recentes:`);
  snap.docs.forEach(doc => {
    const d = doc.data();
    console.log(`- Pedido #${d.pedidoId} | Status: ${d.status} | Data: ${d.criadoEm?.toDate?.() || d.criadoEm}`);
  });
  process.exit(0);
}
main().catch(e => { console.error('❌', e); process.exit(1); });
