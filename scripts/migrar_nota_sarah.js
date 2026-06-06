const admin = require('firebase-admin');

const antigo = admin.initializeApp({ credential: admin.credential.cert('./serviceAccount-pedidos-joey.json') }, 'antigo');
const gestao = admin.initializeApp({ credential: admin.credential.cert('./serviceAccount-gestaojoey.json') }, 'gestao');

async function main() {
  const doc = await antigo.firestore().collection('notasFiscais').doc('32469').get();

  if (!doc.exists) {
    const snap = await antigo.firestore().collection('notasFiscais')
      .where('pedidoId', '==', '32469').limit(1).get();
    if (snap.empty) { console.log('❌ Nota não encontrada'); process.exit(1); }
    const d = snap.docs[0];
    await gestao.firestore().doc(`clientes/joey/notasFiscais/${d.id}`).set(d.data());
    console.log('✅ Nota migrada! ID:', d.id);
    console.log(JSON.stringify(d.data(), null, 2));
  } else {
    await gestao.firestore().doc('clientes/joey/notasFiscais/32469').set(doc.data());
    console.log('✅ Nota migrada!');
    console.log(JSON.stringify(doc.data(), null, 2));
  }
  process.exit(0);
}
main().catch(e => { console.error('❌', e); process.exit(1); });
