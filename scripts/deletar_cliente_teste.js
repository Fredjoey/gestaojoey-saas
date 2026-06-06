const admin = require('firebase-admin');
const path = require('path');

admin.initializeApp({
  credential: admin.credential.cert(path.resolve('./serviceAccount-gestaojoey.json'))
});

const db = admin.firestore();
const SLUG = 'teste-real';
const EMAIL = 'teste-real@gestaojoey.com.br';

async function main() {
  // Apaga usuário do Auth
  try {
    const user = await admin.auth().getUserByEmail(EMAIL);
    await admin.auth().deleteUser(user.uid);
    console.log(`✅ Usuário ${EMAIL} deletado do Auth`);
  } catch (e) {
    console.log(`⚠️ Usuário ${EMAIL} não encontrado`);
  }

  // Apaga doc do cliente em /clientes (se existir na raiz)
  await db.doc(`clientes/${SLUG}`).delete().catch(() => {});
  console.log(`✅ Doc clientes/${SLUG} deletado`);

  // Apaga subcoleções (caso tenha algum dado)
  const subcoles = await db.doc(`clientes/${SLUG}`).listCollections();
  for (const col of subcoles) {
    const snap = await col.get();
    for (const doc of snap.docs) await doc.ref.delete();
    console.log(`✅ Subcoleção ${col.id} limpa`);
  }

  console.log('🎉 Cliente teste-real removido!');
  process.exit(0);
}

main().catch(e => { console.error('❌', e); process.exit(1); });
