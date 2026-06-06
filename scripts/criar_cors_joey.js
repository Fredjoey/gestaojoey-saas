const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccount-gestaojoey.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

(async () => {
  await db.collection('clientes').doc('joey').collection('config').doc('cors').set({
    dominios: [
      'https://hamburgueriajoey.com.br',
      'https://pedidos.hamburgueriajoey.com.br',
      'https://gestao.hamburgueriajoey.com.br'
    ],
    atualizadoEm: admin.firestore.FieldValue.serverTimestamp()
  });

  const doc = await db.collection('clientes').doc('joey').collection('config').doc('cors').get();
  console.log('✅ Config CORS criada:');
  console.log(JSON.stringify(doc.data(), null, 2));
})();
