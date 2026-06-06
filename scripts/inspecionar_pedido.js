const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert('./serviceAccount-gestaojoey.json') });
const db = admin.firestore();

async function main() {
  // Pega 3 pedidos quaisquer pra ver a estrutura
  const snap = await db.collection('clientes/joey/pedidos').limit(3).get();
  console.log(`📦 amostra de ${snap.size} pedidos:\n`);
  snap.docs.forEach((doc, i) => {
    const d = doc.data();
    console.log(`--- pedido ${i+1} (id: ${doc.id}) ---`);
    console.log('campos:', Object.keys(d).sort().join(', '));
    // Mostra valores que parecem timestamp/data
    ['ts','criadoEm','data','timestamp','createdAt','dataHora'].forEach(k => {
      if (d[k] !== undefined) {
        const v = d[k];
        const display = v?.toDate ? v.toDate().toISOString() : (typeof v === 'number' ? new Date(v).toISOString() + ' (num)' : v);
        console.log(`  ${k}: ${display}`);
      }
    });
    console.log('');
  });

  // Pega o pedido com maior ts (mais recente)
  const recente = await db.collection('clientes/joey/pedidos').orderBy('ts', 'desc').limit(1).get();
  if (!recente.empty) {
    const d = recente.docs[0].data();
    console.log(`\n📅 pedido mais recente (por ts):`);
    console.log(`   id: ${recente.docs[0].id}`);
    console.log(`   ts: ${d.ts} → ${new Date(d.ts).toISOString()}`);
    console.log(`   status: ${d.status}`);
  }
  process.exit(0);
}
main().catch(e => { console.error('❌', e); process.exit(1); });
