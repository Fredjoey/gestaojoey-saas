const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccount-gestaojoey.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

(async () => {
  const snap = await db.collection('clientes/joey/categorias').get();
  console.log('Estrutura completa de cada categoria:');
  snap.forEach(d => {
    console.log(`\n=== ${d.id} ===`);
    console.log(JSON.stringify(d.data(), null, 2));
  });
})();
