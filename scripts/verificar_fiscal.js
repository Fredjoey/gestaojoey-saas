const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert('./serviceAccount-gestaojoey.json') });
const db = admin.firestore();

async function main() {
  // Categorias tributárias
  const cats = await db.doc('clientes/joey/config/categoriasTributarias').get();
  console.log('📦 Categorias Tributárias:');
  console.log(JSON.stringify(cats.data(), null, 2));

  // NCM por produto
  const ncm = await db.doc('clientes/joey/config/ncmProdutos').get();
  console.log('\n📦 NCM por Produto:');
  console.log(JSON.stringify(ncm.data(), null, 2));

  // Config fiscal geral
  const fiscal = await db.doc('clientes/joey/config/fiscal').get();
  console.log('\n📦 Config Fiscal:');
  console.log(JSON.stringify(fiscal.data(), null, 2));

  process.exit(0);
}
main().catch(e => { console.error('❌', e); process.exit(1); });
