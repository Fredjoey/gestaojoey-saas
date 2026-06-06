const admin = require('firebase-admin');
const path = require('path');

const app = admin.initializeApp({
  credential: admin.credential.cert(path.resolve('./serviceAccount-gestaojoey.json')),
  storageBucket: 'gestaojoey.firebasestorage.app'
});
const db = app.firestore();
const bucket = app.storage().bucket();
const SLUG = 'joey';

async function main() {
  const snap = await db.collection(`clientes/${SLUG}/catalogoStatus`).get();
  let atualizados = 0;
  for (const doc of snap.docs) {
    const id = doc.id;
    const arquivo = bucket.file(`produtos/${id}/foto`);
    const [existe] = await arquivo.exists();
    if (!existe) { console.log(`⚠️ ${id} - foto não existe no Storage`); continue; }
    await arquivo.makePublic();
    const urlPublica = `https://storage.googleapis.com/${bucket.name}/produtos/${id}/foto`;
    await doc.ref.update({ foto: urlPublica });
    atualizados++;
    console.log(`✅ ${id}`);
  }
  console.log(`🎉 ${atualizados} URLs atualizadas!`);
  process.exit(0);
}

main().catch(e => { console.error('❌', e); process.exit(1); });
