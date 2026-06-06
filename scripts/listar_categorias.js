const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccount-gestaojoey.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

(async () => {
  const snap = await db.collection('clientes/joey/categorias').get();
  console.log(`Total de categorias: ${snap.size}`);
  snap.forEach(d => console.log(`- ${d.id}:`, JSON.stringify(d.data())));
})();
