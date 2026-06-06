const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert('./serviceAccount-gestaojoey.json') });
const db = admin.firestore();

async function main() {
  const snap = await db.collection('clientes/joey/categorias').get();
  console.log(`📦 ${snap.size} categorias cadastradas:`);
  snap.docs.forEach(doc => {
    console.log(`   ID: ${doc.id} | Nome: ${doc.data().nome} | Dados:`, JSON.stringify(doc.data()));
  });
  process.exit(0);
}
main().catch(e => { console.error('❌', e); process.exit(1); });
