const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccount-gestaojoey.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

(async () => {
  const ref = db.doc('clientes/joey');
  const subcollections = await ref.listCollections();
  console.log('Coleções dentro de clientes/joey:');
  for (const col of subcollections) {
    const snap = await col.get();
    console.log(`- ${col.id}: ${snap.size} docs`);
  }

  // Verifica se Margherita (que vimos no cardápio) está em receitas ou em outra coleção
  console.log('\n=== Buscando "Margherita" em receitas ===');
  const margReceita = await db.collection('clientes/joey/receitas')
    .where('name', '==', 'Margherita').get();
  console.log(`Encontrado em receitas: ${margReceita.size}`);
  if (margReceita.size > 0) {
    console.log('Campos:', Object.keys(margReceita.docs[0].data()));
  }
})();
