const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert('./serviceAccount-gestaojoey.json') });
const db = admin.firestore();

async function main() {
  const doc = await db.doc('clientes/joey/notasFiscais/32469').get();
  const d = doc.data();
  console.log('ref:', d.ref);
  console.log('chave:', d.chave);
  console.log('nNF:', d.nNF);
  console.log('status:', d.status);
  console.log('focusRef:', d.focusRef);
  console.log('referencia:', d.referencia);
  console.log('todos os campos:', Object.keys(d));
  process.exit(0);
}
main().catch(e => { console.error('❌', e); process.exit(1); });
