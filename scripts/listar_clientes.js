const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccount-gestaojoey.json');

if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

(async () => {
  const snap = await db.collection('clientes').get();
  console.log(`Total clientes: ${snap.size}`);
  snap.forEach(d => {
    const data = d.data();
    console.log(`- slug=${d.id} | subdominio=${data.subdominio || 'N/A'} | status=${data.status || 'N/A'}`);
  });
  process.exit(0);
})().catch(e => { console.error('❌', e); process.exit(1); });
