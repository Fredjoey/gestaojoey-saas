const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert('./serviceAccount-gestaojoey.json') });
const db = admin.firestore();

async function main() {
  const snap = await db.collection('clientes/joey/recipes').get();
  console.log(`📦 Total de receitas: ${snap.size}`);

  const categorias = {};
  snap.docs.forEach(doc => {
    const cat = doc.data().categoria || 'sem categoria';
    categorias[cat] = (categorias[cat] || 0) + 1;
  });

  console.log('\n📊 Por categoria:');
  Object.entries(categorias).forEach(([cat, qtd]) => {
    console.log(`   ${cat}: ${qtd} receitas`);
  });

  process.exit(0);
}
main().catch(e => { console.error('❌', e); process.exit(1); });
