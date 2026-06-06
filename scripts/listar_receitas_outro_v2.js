const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccount-gestaojoey.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

(async () => {
  const snap = await db.collection('clientes/joey/receitas')
    .where('categoria', '==', 'Outro').get();
  console.log(`Receitas com categoria "Outro": ${snap.size}`);
  snap.forEach(d => console.log(`- ${d.id}: ${d.data().nome || '(sem nome)'}`));
})();
