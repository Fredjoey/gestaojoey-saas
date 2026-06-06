const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccount-gestaojoey.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

(async () => {
  const doc = await db.collection('clientes').doc('pizza-teste').get();
  if (!doc.exists) {
    console.log('❌ pizza-teste não existe');
    return;
  }
  console.log('Cliente pizza-teste:');
  console.log(JSON.stringify(doc.data(), null, 2));

  // Verifica subcoleções
  const subs = await doc.ref.listCollections();
  console.log('\nSubcoleções:', subs.map(s => s.id));

  // Verifica config/cors (seed automático)
  const cors = await doc.ref.collection('config').doc('cors').get();
  console.log('\nConfig/cors existe?', cors.exists);
  if (cors.exists) console.log('Dominios:', JSON.stringify(cors.data().dominios, null, 2));
})();
