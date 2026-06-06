const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccount-gestaojoey.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

(async () => {
  const doc = await db.collection('clientes').doc('bitoca').get();
  if (!doc.exists) {
    console.log('❌ Cliente bitoca NÃO existe no Firestore');
    return;
  }
  console.log('✅ Cliente bitoca existe:');
  console.log(JSON.stringify(doc.data(), null, 2));

  // Lista subcoleções
  const subs = await doc.ref.listCollections();
  console.log('\nSubcoleções:', subs.map(s => s.id));

  // Verifica config/loja
  const loja = await doc.ref.collection('config').doc('loja').get();
  console.log('\nConfig/loja existe?', loja.exists);

  // Verifica config/cors
  const cors = await doc.ref.collection('config').doc('cors').get();
  console.log('Config/cors existe?', cors.exists);
  if (cors.exists) console.log('Dominios:', cors.data().dominios);
})();
