const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccount-gestaojoey.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

(async () => {
  console.log('=== VERIFICAÇÃO INTEGRIDADE DOS DADOS DO JOEY ===\n');

  const colecoes = ['recipes', 'categorias', 'insumos', 'adicionais', 'operacionais', 'fixedCosts', 'variableCosts', 'pedidos', 'vendas', 'notasFiscais', 'clientes', 'config', 'botConfig'];

  for (const col of colecoes) {
    try {
      const snap = await db.collection(`clientes/joey/${col}`).get();
      console.log(`✓ clientes/joey/${col}: ${snap.size} docs`);
    } catch (err) {
      console.log(`✗ clientes/joey/${col}: ERRO - ${err.message}`);
    }
  }

  // Configurações específicas
  console.log('\n=== CONFIGS ===');
  const configs = ['loja', 'fiscal', 'cors', 'categoriasTributarias', 'ncmProdutos'];
  for (const c of configs) {
    const doc = await db.collection('clientes/joey/config').doc(c).get();
    console.log(`  config/${c}: ${doc.exists ? '✅ existe' : '❌ NÃO EXISTE'}`);
  }
})();
