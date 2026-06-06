const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccount-gestaojoey.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

(async () => {
  // Mostra estrutura atual
  const snap = await db.collection('clientes/joey/categoriasTributarias').get();
  console.log(`Total: ${snap.size} categorias tributárias\n`);
  snap.forEach(d => {
    console.log(`=== ${d.id} ===`);
    console.log(JSON.stringify(d.data(), null, 2));
  });
})();
