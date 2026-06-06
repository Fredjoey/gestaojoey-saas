const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert('./serviceAccount-gestaojoey.json') });
const db = admin.firestore();

async function main() {
  const snap = await db.collection('clientes/joey/recipes')
    .where('categoria', '==', 'Porção').get();

  console.log(`📦 ${snap.size} receitas para corrigir`);
  const batch = db.batch();
  snap.docs.forEach(doc => {
    batch.update(doc.ref, { categoria: 'Acompanhamento' });
    console.log(`   → ${doc.data().name}`);
  });

  await batch.commit();
  console.log('✅ Categorias corrigidas!');
  process.exit(0);
}
main().catch(e => { console.error('❌', e); process.exit(1); });
