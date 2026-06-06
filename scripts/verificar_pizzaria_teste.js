const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert('./serviceAccount-gestaojoey.json') });
const db = admin.firestore();

async function main() {
  try {
    const user = await admin.auth().getUserByEmail('pizzaria-teste@gestaojoey.com.br');
    console.log('❌ Auth ainda existe:', user.uid);
  } catch { console.log('✅ Auth deletado'); }

  const doc = await db.doc('clientes/pizzaria-teste').get();
  console.log(doc.exists ? '❌ Doc existe' : '✅ Doc deletado');

  process.exit(0);
}
main().catch(e => { console.error('❌', e); process.exit(1); });
