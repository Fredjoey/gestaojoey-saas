const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccount-gestaojoey.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

(async () => {
  // Verifica se já existe
  const existe = await db.collection('clientes/joey/categorias')
    .where('nome', '==', 'Sub-receitas').get();

  if (!existe.empty) {
    console.log('⚠️ Categoria "Sub-receitas" já existe. Abortando.');
    return;
  }

  const id = Date.now();
  await db.collection('clientes/joey/categorias').doc(String(id)).set({
    id,
    nome: 'Sub-receitas',
    emoji: '📦',
    interna: true,
    ordem: 99
  });

  console.log('✅ Categoria "Sub-receitas" criada com sucesso!');
  console.log({ id, nome: 'Sub-receitas', emoji: '📦', interna: true, ordem: 99 });
})();
