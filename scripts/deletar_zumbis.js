const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccount-gestaojoey.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function deletarColecao(nome) {
  const snap = await db.collection(`clientes/joey/${nome}`).get();
  console.log(`\n📋 ${nome}: ${snap.size} docs encontrados`);

  if (snap.empty) {
    console.log(`   (já está vazia)`);
    return;
  }

  // Batch delete em lotes de 500 (limite do Firestore)
  let batch = db.batch();
  let count = 0;
  for (const doc of snap.docs) {
    batch.delete(doc.ref);
    count++;
    if (count % 500 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  if (count % 500 !== 0) await batch.commit();

  // Verifica
  const after = await db.collection(`clientes/joey/${nome}`).get();
  console.log(`   ✅ Deletados: ${count} | Restantes: ${after.size}`);
}

(async () => {
  console.log('🗑️  Iniciando deleção das coleções zumbi...');
  await deletarColecao('receitas');
  await deletarColecao('custosfixos');
  await deletarColecao('custosvariaveis');
  console.log('\n✅ Operação concluída!');
})();
