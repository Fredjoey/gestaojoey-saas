const admin = require('firebase-admin');
const antigo = admin.initializeApp({ credential: admin.credential.cert('./serviceAccount-pedidos-joey.json') });

async function main() {
  const snap = await antigo.firestore().collection('notasFiscais')
    .where('focusRef', '==', 'joey-32469-1778264005358').get();
  console.log(`📦 ${snap.size} notas encontradas no pedidos-joey`);
  snap.docs.forEach(doc => {
    console.log('ID:', doc.id);
    console.log(JSON.stringify(doc.data(), null, 2));
  });
  process.exit(0);
}
main().catch(e => { console.error('❌', e); process.exit(1); });
