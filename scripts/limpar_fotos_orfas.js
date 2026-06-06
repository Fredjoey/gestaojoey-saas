const admin = require('firebase-admin');
const path = require('path');

const app = admin.initializeApp({ credential: admin.credential.cert(path.resolve('./serviceAccount-gestaojoey.json')) });
const db = app.firestore();
const SLUG = 'joey';

const ORFAS = ['1776884490185', '1776885225252', '1777094222112', '1777138570501', '1777726007769'];

async function main() {
  for (const id of ORFAS) {
    await db.doc(`clientes/${SLUG}/catalogoStatus/${id}`).update({ foto: null });
    console.log(`✅ ${id} - foto limpa`);
  }
  console.log('🎉 Limpeza concluída!');
  process.exit(0);
}

main().catch(e => { console.error('❌', e); process.exit(1); });
