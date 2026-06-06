const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccount-gestaojoey.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

(async () => {
  // Verifica recipes (nome novo em inglês)
  const recipes = await db.collection('clientes/joey/recipes').get();
  console.log(`📦 clientes/joey/recipes: ${recipes.size} docs`);

  // Lista as primeiras 5 para amostra
  let count = 0;
  recipes.forEach(d => {
    if (count < 5) {
      const data = d.data();
      console.log(`  - ${d.id}: nome="${data.nome || data.name || 'sem nome'}" categoria="${data.categoria || data.category || 'sem cat'}"`);
      count++;
    }
  });

  // Verifica se tem receitas (nome antigo PT) por acaso
  const receitas = await db.collection('clientes/joey/receitas').get();
  console.log(`\n🔍 clientes/joey/receitas (legado): ${receitas.size} docs`);

  // Verifica categorias
  const cats = await db.collection('clientes/joey/categorias').get();
  console.log(`\n📂 clientes/joey/categorias: ${cats.size} docs`);
  cats.forEach(d => console.log(`  - ${d.data().nome || d.id}`));
})();
