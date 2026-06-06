const admin = require('firebase-admin');
const path = require('path');

const origemApp = admin.initializeApp({ credential: admin.credential.cert(path.resolve('./serviceAccount-pedidos-joey.json')) }, 'origem');
const origemJoeyApp = admin.initializeApp({ credential: admin.credential.cert(path.resolve('./serviceAccount-sistema-joey.json')) }, 'origemJoey');
const destinoApp = admin.initializeApp({ credential: admin.credential.cert(path.resolve('./serviceAccount-gestaojoey.json')) }, 'destino');

const dbOrigem = origemApp.firestore();
const dbOrigemJoey = origemJoeyApp.firestore();
const dbDestino = destinoApp.firestore();
const SLUG = 'joey';

async function migrar(db, col) {
  const snap = await db.collection(col).get();
  if (snap.empty) { console.log(`⚠️ ${col} vazia`); return; }
  let batch = dbDestino.batch(), count = 0, total = 0;
  for (const doc of snap.docs) {
    batch.set(dbDestino.collection(`clientes/${SLUG}/${col}`).doc(doc.id), doc.data());
    if (++count === 400) { await batch.commit(); batch = dbDestino.batch(); count = 0; }
    total++;
  }
  if (count > 0) await batch.commit();
  console.log(`✅ ${col}: ${total} docs`);
}

async function main() {
  for (const col of ['pedidos','clientes','mesas','conversas','notasFiscais','backups','botConfig','mensagensProgramadas','fechamentos','catalogoStatus','config'])
    await migrar(dbOrigem, col);
  for (const col of ['categorias','recipes','adicionais'])
    await migrar(dbOrigemJoey, col);
  console.log('🎉 Migração concluída!');
  process.exit(0);
}

main().catch(e => { console.error('❌', e); process.exit(1); });
