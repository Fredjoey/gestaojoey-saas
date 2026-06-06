const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert('./serviceAccount-gestaojoey.json') });
const db = admin.firestore();

async function main() {
  try {
    const user = await admin.auth().getUserByEmail('teste-exclusao@gestaojoey.com.br');
    console.log('❌ Auth ainda existe:', user.uid);
  } catch { console.log('✅ Auth deletado'); }

  const doc = await db.doc('clientes/teste-exclusao').get();
  console.log(doc.exists ? '❌ Doc Firestore ainda existe' : '✅ Firestore deletado');

  const sub = await db.collection('clientes/teste-exclusao/config').get();
  console.log(sub.size > 0 ? `❌ ${sub.size} docs em subcoleção` : '✅ Subcoleções limpas');

  process.exit(0);
}
main().catch(e => { console.error('❌', e); process.exit(1); });
