const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert('./serviceAccount-gestaojoey.json') });
const db = admin.firestore();

async function main() {
  const doc = await db.doc('clientes/joey/notasFiscais/32469').get();
  if (!doc.exists) { console.log('❌ Nota não encontrada'); process.exit(1); }
  console.log('✅ Nota encontrada:');
  console.log(JSON.stringify(doc.data(), null, 2));
  process.exit(0);
}
main().catch(e => { console.error('❌', e); process.exit(1); });
