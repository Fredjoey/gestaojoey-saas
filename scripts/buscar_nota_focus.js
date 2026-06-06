const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert('./serviceAccount-gestaojoey.json') });
const db = admin.firestore();

async function main() {
  const snap = await db.collection('clientes/joey/notasFiscais')
    .where('focusRef', '==', 'joey-32469-1778264005358').get();
  console.log(`📦 ${snap.size} notas encontradas`);
  snap.docs.forEach(doc => {
    console.log('ID:', doc.id);
    console.log(JSON.stringify(doc.data(), null, 2));
  });
  process.exit(0);
}
main().catch(e => { console.error('❌', e); process.exit(1); });
