const admin = require('firebase-admin');
const path = require('path');

admin.initializeApp({
  credential: admin.credential.cert(path.resolve('./serviceAccount-gestaojoey.json'))
});

const db = admin.firestore();

async function main() {
  const snap = await db.collection('clientes/joey/config').get();
  console.log(`📦 ${snap.size} docs em clientes/joey/config:`);
  snap.docs.forEach(doc => {
    console.log(`   ${doc.id}`);
  });
  process.exit(0);
}

main().catch(e => { console.error('❌', e); process.exit(1); });
