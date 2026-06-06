const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert('./serviceAccount-gestaojoey.json') });

async function main() {
  const doc = await admin.firestore().doc('clientes/teste-railway-fix').get();
  if (!doc.exists) { console.log('❌ Doc clientes/teste-railway-fix não existe'); process.exit(1); }
  console.log(JSON.stringify(doc.data(), null, 2));
  process.exit(0);
}
main().catch(e => { console.error('❌', e); process.exit(1); });
