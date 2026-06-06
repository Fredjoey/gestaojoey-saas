const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccount-gestaojoey.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

(async () => {
  for (const colName of ['recipes', 'adicionais', 'insumos']) {
    const snap = await db.collection(`clientes/joey/${colName}`).get();
    const categorias = {};
    snap.docs.forEach(d => {
      const cat = d.data().categoria;
      const key = cat === undefined ? '<<undefined>>' : (cat === null ? '<<null>>' : (cat === '' ? '<<empty>>' : JSON.stringify(cat)));
      categorias[key] = (categorias[key] || 0) + 1;
    });
    console.log(`\n📂 ${colName} (${snap.size} docs):`);
    Object.entries(categorias).sort((a,b)=>b[1]-a[1]).forEach(([cat, qtd]) => {
      console.log(`   ${cat}: ${qtd}`);
    });
  }
  process.exit(0);
})().catch(e => { console.error('❌', e); process.exit(1); });
