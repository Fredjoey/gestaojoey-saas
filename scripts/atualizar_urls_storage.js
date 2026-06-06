const admin = require('firebase-admin');
const path = require('path');

const app = admin.initializeApp({ credential: admin.credential.cert(path.resolve('./serviceAccount-gestaojoey.json')) });
const db = app.firestore();
const SLUG = 'joey';
const DE = 'pedidos-joey.firebasestorage.app';
const PARA = 'gestaojoey.firebasestorage.app';

async function atualizarColecao(col, campo) {
  const snap = await db.collection(`clientes/${SLUG}/${col}`).get();
  let atualizados = 0;
  for (const doc of snap.docs) {
    const valor = doc.data()[campo];
    if (valor && valor.includes(DE)) {
      await doc.ref.update({ [campo]: valor.replace(DE, PARA) });
      atualizados++;
    }
  }
  console.log(`✅ ${col}.${campo}: ${atualizados} atualizados`);
}

async function main() {
  await atualizarColecao('recipes', 'foto');
  await atualizarColecao('catalogoStatus', 'foto');
  console.log('🎉 URLs atualizadas!');
  process.exit(0);
}

main().catch(e => { console.error('❌', e); process.exit(1); });
