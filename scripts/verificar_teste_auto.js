const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert('./serviceAccount-gestaojoey.json') });
const db = admin.firestore();

async function main() {
  // Auth
  try {
    const user = await admin.auth().getUserByEmail('teste-auto@gestaojoey.com.br');
    console.log('❌ Auth ainda existe:', user.uid);
  } catch {
    console.log('✅ Auth deletado');
  }

  // Firestore
  const doc = await db.doc('clientes/teste-auto').get();
  console.log(doc.exists ? '❌ Doc existe' : '✅ Doc deletado');

  const sub = await db.collection('clientes/teste-auto/config').get();
  console.log(sub.size > 0 ? `❌ ${sub.size} docs em subcoleção` : '✅ Subcoleções vazias');

  process.exit(0);
}
main().catch(e => { console.error('❌', e); process.exit(1); });
