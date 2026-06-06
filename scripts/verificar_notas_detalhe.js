const admin = require('firebase-admin');

const gestao = admin.initializeApp({ credential: admin.credential.cert('./serviceAccount-gestaojoey.json') }, 'gestao');
const antigo = admin.initializeApp({ credential: admin.credential.cert('./serviceAccount-pedidos-joey.json') }, 'antigo');

async function main() {
  // Notas na raiz do projeto antigo
  const snapAntigo = await antigo.firestore().collection('notasFiscais')
    .orderBy('criadoEm', 'desc').limit(5).get();
  console.log(`📦 Notas no projeto ANTIGO (pedidos-joey): ${snapAntigo.size}`);
  snapAntigo.docs.forEach(doc => {
    const d = doc.data();
    console.log(`- Pedido #${d.pedidoId} | Status: ${d.status} | Data: ${d.criadoEm?.toDate?.() || d.criadoEm}`);
  });

  // Detalhe das notas pendentes no gestaojoey
  const snapNovo = await gestao.firestore().collection('clientes/joey/notasFiscais')
    .where('status', '==', 'pendente').limit(5).get();
  console.log(`\n📦 Notas PENDENTES no gestaojoey: ${snapNovo.size}`);
  snapNovo.docs.forEach(doc => {
    const d = doc.data();
    console.log(`- Pedido #${d.pedidoId} | nNF: ${d.nNF} | chave: ${d.chave || 'sem chave'}`);
  });

  process.exit(0);
}
main().catch(e => { console.error('❌', e); process.exit(1); });
