/**
 * Corrige o total do pedido 34156 (joey), corrompido pelo bug do editor de pedido
 * (o recálculo perdia os adicionais dos itens já existentes).
 *
 * Gravado: R$ 103,00  →  Correto: R$ 116,00 (faltavam os R$ 13 de adicionais do
 * 2º item: Cebola 4 + Catupiry 5 + Cebola crisp 4).
 *
 * Guarda backup do valor antigo no próprio doc (correcaoTotal.*) — nada é perdido.
 * Só escreve se o total gravado realmente divergir do canônico. Idempotente.
 *
 * Uso: node scripts/corrigir_pedido_34156.js [--aplicar]
 *      (sem --aplicar faz dry-run e não escreve nada)
 */
const admin = require('firebase-admin');
const { subtotalItens } = require('../functions/preco');

admin.initializeApp({ credential: admin.credential.cert('./serviceAccount-gestaojoey.json') });
const db = admin.firestore();

const SLUG    = 'joey';
const PEDIDO  = '34156';
const APLICAR = process.argv.includes('--aplicar');
const fmt = v => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');

async function main() {
  const ref  = db.doc(`clientes/${SLUG}/pedidos/${PEDIDO}`);
  const snap = await ref.get();
  if (!snap.exists) throw new Error(`pedido ${PEDIDO} não existe em clientes/${SLUG}/pedidos`);

  const p     = snap.data();
  const itens = Array.isArray(p.itens) ? p.itens : [];

  const subtotalCanon = subtotalItens(itens);
  const taxa          = Number(p.taxaEntrega) || 0;
  const totalCorreto  = subtotalCanon + taxa;           // sem desconto neste pedido
  const totalAtual    = Number(p.total) || 0;
  const subtotalAtual = Number(p.subtotal) || 0;

  console.log(`\n📦 pedido ${PEDIDO} (${p.data} ${p.hora}) — status "${p.status}" · pagamento "${p.pagamento}"\n`);
  itens.forEach(it => {
    const adics = (it.adicionais || []);
    console.log(`   ${it.qty}× ${it.nome} — base ${fmt(it.preco)}`);
    adics.forEach(a => console.log(`        + ${a.qty || 1}× ${a.nome} ${fmt(a.preco)}`));
  });
  console.log(`\n   subtotal gravado : ${fmt(subtotalAtual)}`);
  console.log(`   subtotal correto : ${fmt(subtotalCanon)}`);
  console.log(`   taxa de entrega  : ${fmt(taxa)}`);
  console.log(`   TOTAL gravado    : ${fmt(totalAtual)}`);
  console.log(`   TOTAL correto    : ${fmt(totalCorreto)}`);
  console.log(`   diferença        : ${fmt(totalCorreto - totalAtual)}\n`);

  if (Math.abs(totalAtual - totalCorreto) < 0.011) {
    console.log('✅ total já está correto — nada a fazer (idempotente).');
    return;
  }
  if (p.desconto) throw new Error('pedido tem desconto — abortando, este script não trata desconto');
  if (!APLICAR) {
    console.log('🔎 DRY-RUN — nada foi escrito. Rode com --aplicar para gravar.');
    return;
  }

  await ref.update({
    total:    totalCorreto,
    subtotal: subtotalCanon,
    correcaoTotal: {                                   // BACKUP do que estava gravado
      totalAnterior:    totalAtual,
      subtotalAnterior: subtotalAtual,
      totalNovo:        totalCorreto,
      motivo:           'bug do editor de pedido: recálculo perdia os adicionais dos itens existentes',
      corrigidoEm:      admin.firestore.FieldValue.serverTimestamp(),
      corrigidoPor:     'scripts/corrigir_pedido_34156.js',
    },
  });

  const depois = (await ref.get()).data();
  console.log(`✅ gravado. total agora: ${fmt(depois.total)} · subtotal: ${fmt(depois.subtotal)}`);
  console.log(`   backup no doc → correcaoTotal.totalAnterior = ${fmt(depois.correcaoTotal.totalAnterior)}`);
}

main().then(() => process.exit(0)).catch(e => { console.error('❌', e.message); process.exit(1); });
