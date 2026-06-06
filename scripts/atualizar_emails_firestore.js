const admin = require('firebase-admin');
const path = require('path');

admin.initializeApp({
  credential: admin.credential.cert(path.resolve('./serviceAccount-gestaojoey.json'))
});
const db = admin.firestore();
const SLUG = 'joey';

const REPLACES = [
  ['fred@joey.com', 'fred@joey.app.br'],
  ['bella@joey.com', 'isabela@joey.app.br']
];

function deepReplace(obj, ctx) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') {
    let v = obj;
    for (const [from, to] of REPLACES) v = v.split(from).join(to);
    if (v !== obj) ctx.changed = true;
    return v;
  }
  if (Array.isArray(obj)) return obj.map(v => deepReplace(v, ctx));
  if (typeof obj === 'object' && obj.constructor === Object) {
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[k] = deepReplace(v, ctx);
    return out;
  }
  return obj;
}

async function main() {
  const parent = db.doc(`clientes/${SLUG}`);
  const subcollections = await parent.listCollections();
  console.log(`📦 ${subcollections.length} subcoleções em clientes/${SLUG}/`);
  let totalDocs = 0, updated = 0;
  for (const col of subcollections) {
    const snap = await col.get();
    let colUpdated = 0;
    for (const doc of snap.docs) {
      totalDocs++;
      const ctx = { changed: false };
      const newData = deepReplace(doc.data(), ctx);
      if (ctx.changed) {
        await doc.ref.set(newData);
        colUpdated++;
        updated++;
      }
    }
    console.log(`  ${col.id}: ${colUpdated}/${snap.size} atualizados`);
  }
  console.log(`🎉 ${updated}/${totalDocs} docs atualizados`);
  process.exit(0);
}

main().catch(e => { console.error('❌', e); process.exit(1); });
