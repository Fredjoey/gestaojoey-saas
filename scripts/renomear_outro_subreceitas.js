const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccount-gestaojoey.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

(async () => {
  const snap = await db.collection('clientes/joey/receitas')
    .where('categoria', '==', 'Outro').get();

  console.log(`Encontradas ${snap.size} receitas com categoria "Outro"`);

  const batch = db.batch();
  snap.forEach(doc => {
    console.log(`- Atualizando: ${doc.data().name}`);
    batch.update(doc.ref, { categoria: 'Sub-receitas' });
  });

  await batch.commit();
  console.log('✅ Atualização concluída!');
})();
