const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccount-gestaojoey.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

(async () => {
  const snap = await db.collection('clientes').get();
  console.log(`Total de clientes: ${snap.size}\n`);
  snap.forEach(d => {
    const data = d.data();
    console.log(`- slug=${d.id} | nome=${data.nome || 'N/A'} | status=${data.status || 'N/A'}`);
  });
})();
