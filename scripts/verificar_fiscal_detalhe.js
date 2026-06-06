const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert('./serviceAccount-gestaojoey.json') });
const db = admin.firestore();

async function main() {
  const fiscal = await db.doc('clientes/joey/config/fiscal').get();
  console.log(JSON.stringify(fiscal.data(), null, 2));
  process.exit(0);
}
main().catch(e => { console.error('❌', e); process.exit(1); });
