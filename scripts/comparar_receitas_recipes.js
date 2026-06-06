const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccount-gestaojoey.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

(async () => {
  const receitas = await db.collection('clientes/joey/receitas').get();
  const recipes = await db.collection('clientes/joey/recipes').get();

  console.log(`receitas: ${receitas.size} docs`);
  console.log(`recipes: ${recipes.size} docs`);

  // Mapeia por nome
  const mapReceitas = {};
  receitas.forEach(d => { const n = d.data().name; if(n) mapReceitas[n] = d; });
  const mapRecipes = {};
  recipes.forEach(d => { const n = d.data().name; if(n) mapRecipes[n] = d; });

  const nomesReceitas = Object.keys(mapReceitas);
  const nomesRecipes = Object.keys(mapRecipes);

  console.log('\n=== Em receitas mas NÃO em recipes ===');
  nomesReceitas.filter(n => !mapRecipes[n]).forEach(n => console.log(`- ${n}`));

  console.log('\n=== Em recipes mas NÃO em receitas ===');
  nomesRecipes.filter(n => !mapReceitas[n]).forEach(n => console.log(`- ${n}`));

  console.log('\n=== Diferenças nas Sub-receitas (renomeei só em "receitas") ===');
  ['Maionese da Casa', 'Cebola Caramelizada', 'Maionese Verde'].forEach(n => {
    const r1 = mapReceitas[n]?.data();
    const r2 = mapRecipes[n]?.data();
    console.log(`${n}: receitas.categoria=${r1?.categoria}, recipes.categoria=${r2?.categoria}`);
  });
})();
