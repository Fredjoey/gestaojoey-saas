const admin = require('firebase-admin');
const fs = require('fs');
const serviceAccount = require('./serviceAccount-gestaojoey.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

(async () => {
  const colecoes = ['receitas', 'custosfixos', 'custosvariaveis'];
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = `backup_zumbis_${timestamp}`;
  fs.mkdirSync(backupDir);

  for (const nome of colecoes) {
    const snap = await db.collection(`clientes/joey/${nome}`).get();
    const dados = {};
    snap.forEach(d => { dados[d.id] = d.data(); });

    const arquivo = `${backupDir}/${nome}.json`;
    fs.writeFileSync(arquivo, JSON.stringify(dados, null, 2));
    console.log(`✅ ${nome}: ${snap.size} docs salvos em ${arquivo}`);
  }

  console.log(`\n📦 Backup completo em: ${backupDir}/`);
})();
