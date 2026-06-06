const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccount-gestaojoey.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

(async () => {
  const snap = await db.collection('clientes/joey/receitas')
    .where('categoria', '==', 'Sub-receitas').get();

  console.log(`Total Sub-receitas: ${snap.size}`);
  snap.forEach(d => {
    const data = d.data();
    console.log(`- ${data.name}: ativo=${data.ativo}, vender=${data.vender}, naoVender=${data.naoVender}`);
  });

  // Mostra também os campos disponíveis no primeiro doc
  if (snap.size > 0) {
    console.log('\nCampos do primeiro doc:', Object.keys(snap.docs[0].data()));
  }
})();
