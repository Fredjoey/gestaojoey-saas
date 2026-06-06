const admin = require('firebase-admin');
const path = require('path');
const https = require('https');
const fs = require('fs');

const origem = admin.initializeApp({ credential: admin.credential.cert(path.resolve('./serviceAccount-pedidos-joey.json')), storageBucket: 'pedidos-joey.firebasestorage.app' }, 'origem');
const destino = admin.initializeApp({ credential: admin.credential.cert(path.resolve('./serviceAccount-gestaojoey.json')), storageBucket: 'gestaojoey.firebasestorage.app' }, 'destino');

async function migrarStorage() {
  const [arquivos] = await origem.storage().bucket().getFiles();
  console.log(`📦 ${arquivos.length} arquivos encontrados`);
  for (const arquivo of arquivos) {
    const [buffer] = await arquivo.download();
    const destFile = destino.storage().bucket().file(arquivo.name);
    await destFile.save(buffer, { contentType: arquivo.metadata.contentType });
    console.log(`✅ ${arquivo.name}`);
  }
  console.log('🎉 Storage migrado!');
  process.exit(0);
}

migrarStorage().catch(e => { console.error('❌', e); process.exit(1); });
