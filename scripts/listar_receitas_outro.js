const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert('./serviceAccount-gestaojoey.json') });
const db = admin.firestore();

async function main() {
  const snap = await db.collection('clientes/joey/recipes')
    .where('categoria', 'in', ['Outro', 'Porção']).get();

  console.log(`📦 ${snap.size} receitas para revisar:\n`);
  snap.docs.forEach(doc => {
    const d = doc.data();
    console.log(`[${d.categoria}] ${d.name} — R$ ${d.price ?? '?'}`);
  });
  process.exit(0);
}
main().catch(e => { console.error('❌', e); process.exit(1); });
