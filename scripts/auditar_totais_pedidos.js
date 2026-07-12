/**
 * AUDITORIA (SÓ LEITURA) — pedidos com total gravado diferente do total canônico.
 *
 * Motivo: o editor de pedido do painel recalculava o total ignorando os adicionais
 * dos itens (dependia do campo `precoTotal`, que só o Novo Pedido gravava). Todo
 * pedido do cardápio/garçom/mesa/WhatsApp que passou pelo editor teve o total
 * regravado A MENOS. Este script acha os pedidos já corrompidos no banco.
 *
 * Total canônico = Σ [ (preco + Σ adicionais.preco × adicionais.qty) × qty ]
 *                  − desconto.valorAplicado + taxaEntrega
 *
 * NÃO ESCREVE NADA. Uso:
 *   node scripts/auditar_totais_pedidos.js              # todos os clientes
 *   node scripts/auditar_totais_pedidos.js joey         # só um slug
 */
const admin = require('firebase-admin');
const { subtotalItens } = require('./preco');

admin.initializeApp({ credential: admin.credential.cert('./serviceAccount-gestaojoey.json') });
const db = admin.firestore();

const TOL = 0.011;                       // tolerância de arredondamento (1 centavo)
const fmt = v => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');
const slugArg = process.argv[2] || null;

function descontoAplicado(p, subtotal) {
  const d = p.desconto;
  if (!d) return 0;
  const bruto = d.tipo === 'percent'
    ? subtotal * ((Number(d.valor) || 0) / 100)
    : (Number(d.valorAplicado != null ? d.valorAplicado : d.valor) || 0);
  return Math.min(Math.max(bruto, 0), subtotal);
}

function auditarPedido(p) {
  const itens = Array.isArray(p.itens) ? p.itens : [];
  if (!itens.length) return null;                       // sem itens → nada a conferir

  const subtotalCanon = subtotalItens(itens);
  const taxa          = Number(p.taxaEntrega) || 0;
  const desc          = descontoAplicado(p, subtotalCanon);
  const totalEsperado = Math.max(0, subtotalCanon - desc) + taxa;
  const totalGravado  = Number(p.total != null ? p.total : (Number(p.subtotal || 0) + taxa)) || 0;

  const diff = +(totalGravado - totalEsperado).toFixed(2);
  if (Math.abs(diff) < TOL) return null;

  // Valor dos adicionais do pedido — se o rombo bate com ele, é a assinatura do bug
  const valorAdics = itens.reduce((s, it) => {
    const a = (it.adicionais || []).reduce(
      (x, ad) => x + (Number(ad && ad.preco) || 0) * (Number(ad && ad.qty != null ? ad.qty : 1) || 0), 0);
    return s + a * (Number(it.qty) || 1);
  }, 0);

  return {
    id: p.id, data: p.data || '?', hora: p.hora || '', status: p.status || '?',
    origem: p.origem || (p.mesa ? 'mesa' : '?'), entrega: p.entrega || '?',
    totalGravado, totalEsperado, diff, valorAdics,
    assinaturaDoBug: Math.abs(diff + valorAdics) < TOL,   // faltando exatamente os adicionais
  };
}

async function auditarCliente(slug) {
  const snap = await db.collection(`clientes/${slug}/pedidos`).get();
  const achados = [];
  snap.docs.forEach(doc => {
    const r = auditarPedido({ id: doc.id, ...doc.data() });
    if (r) achados.push(r);
  });
  return { slug, totalPedidos: snap.size, achados };
}

async function main() {
  const slugs = slugArg
    ? [slugArg]
    : (await db.collection('clientes').get()).docs.map(d => d.id);

  console.log(`🔎 auditando ${slugs.length} cliente(s): ${slugs.join(', ')}\n`);

  let grandTotalPedidos = 0, grandCorrompidos = 0, grandPrejuizo = 0;

  for (const slug of slugs) {
    let res;
    try { res = await auditarCliente(slug); }
    catch (e) { console.log(`⚠️  ${slug}: ${e.message}\n`); continue; }

    grandTotalPedidos += res.totalPedidos;
    if (!res.achados.length) {
      console.log(`✅ ${slug} — ${res.totalPedidos} pedidos, 0 divergências\n`);
      continue;
    }

    res.achados.sort((a, b) => a.diff - b.diff);
    const menos = res.achados.filter(a => a.diff < 0);
    const mais  = res.achados.filter(a => a.diff > 0);
    const prejuizo = menos.filter(a => a.status !== 'cancelado')
                          .reduce((s, a) => s + Math.abs(a.diff), 0);

    grandCorrompidos += res.achados.length;
    grandPrejuizo    += prejuizo;

    console.log(`❌ ${slug} — ${res.totalPedidos} pedidos | ${res.achados.length} com total errado`);
    console.log(`   ${menos.length} cobrando A MENOS · ${mais.length} cobrando A MAIS · prejuízo ${fmt(prejuizo)}\n`);
    console.log('   PEDIDO   DATA        STATUS      ORIGEM     GRAVADO      ESPERADO     DIFERENÇA   ADICIONAIS  BUG?');
    res.achados.forEach(a => {
      console.log(
        '   ' + String(a.id).padEnd(8) +
        String(a.data).padEnd(12) +
        String(a.status).padEnd(12) +
        String(a.origem).padEnd(11) +
        fmt(a.totalGravado).padEnd(13) +
        fmt(a.totalEsperado).padEnd(13) +
        (a.diff > 0 ? '+' : '') + fmt(a.diff).padEnd(11) +
        fmt(a.valorAdics).padEnd(12) +
        (a.assinaturaDoBug ? '✔ adicionais sumidos' : '—')
      );
    });
    console.log('');
  }

  console.log('─'.repeat(100));
  console.log(`TOTAL: ${grandTotalPedidos} pedidos auditados · ${grandCorrompidos} com total divergente · prejuízo acumulado ${fmt(grandPrejuizo)}`);
  console.log('(nenhuma escrita foi feita — auditoria só leitura)');
  process.exit(0);
}

main().catch(e => { console.error('❌', e); process.exit(1); });
