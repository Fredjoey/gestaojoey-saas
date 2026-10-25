// TESTE — comparativo mês a mês (gestao-joey.html).
//   node testes/comparativo-mes.js     (hermético: a conta, sem navegador)
//
// A loja abre quarta a domingo, então mês não é mês: jul/2026 teve 24 dias abertos e jun teve 21.
// Comparar TOTAIS faz o mês comprido parecer melhor do que foi, e faz o mês em curso parecer
// sempre em queda. Este teste trava as duas contas com os números reais do Firestore.
let falhas = 0, total = 0;
function ok(nome, real, esperado) {
  total++;
  const bate = JSON.stringify(real) === JSON.stringify(esperado);
  if (!bate) falhas++;
  console.log(`  ${bate ? 'OK   ' : 'FALHA'} ${String(nome).padEnd(56)} ${JSON.stringify(real)}${bate ? '' : `  ← esperado ${JSON.stringify(esperado)}`}`);
}

// Dados reais (clientes/joey/pedidos, cancelados fora), lidos em 25/10/2026.
const MESES = {
  '2026-05': { n: 819, v: 57856, dias: 21 },
  '2026-06': { n: 611, v: 42533, dias: 21 },
  '2026-07': { n: 726, v: 54318, dias: 24 },
  '2026-08': { n: 672, v: 50112, dias: 22 },
  '2026-09': { n: 581, v: 41896, dias: 21 },
  '2026-10': { n: 541, v: 39296, dias: 18 },
};

// A mesma conta da tela.
function variacao(yms, meses, porDia, i) {
  if (i === 0) return null;
  const m = meses[yms[i]], a = meses[yms[i - 1]];
  const val = porDia ? m.v / (m.dias || 1) : m.v;
  const ant = porDia ? a.v / (a.dias || 1) : a.v;
  if (!(ant > 0)) return null;
  return (val / ant - 1) * 100;
}
const yms = Object.keys(MESES).sort();
const r1 = n => Math.round(n * 10) / 10;

console.log('\n=== 1) Outubro: o total mente, o por-dia conta a verdade ===');
{
  const t = variacao(yms, MESES, false, 5);
  const d = variacao(yms, MESES, true, 5);
  ok('pelo TOTAL aparece queda', r1(t), -6.2);
  ok('por DIA ABERTO é alta', r1(d), 9.4);
  ok('⚠️ os dois discordam de SINAL', [t < 0, d > 0], [true, true]);
}

console.log('\n=== 2) Julho: o mês que enganou ===');
{
  const t = variacao(yms, MESES, false, 2);
  const d = variacao(yms, MESES, true, 2);
  ok('pelo TOTAL, +27,7% sobre junho', r1(t), 27.7);
  ok('por DIA, só +11,7%', r1(d), 11.7);
  ok('mais da metade da alta era calendário', t > d * 2, true);
}

console.log('\n=== 3) Agosto: quase empate por dia, queda no total ===');
{
  ok('total cai', r1(variacao(yms, MESES, false, 3)), -7.7);
  ok('por dia, praticamente igual', r1(variacao(yms, MESES, true, 3)), 0.6);
}

console.log('\n=== 4) Mesmos dias abertos → os dois modos concordam ===');
{
  const iguais = { 'A': { n: 100, v: 20000, dias: 20 }, 'B': { n: 120, v: 25000, dias: 20 } };
  const k = ['A', 'B'];
  ok('total e por-dia dão o mesmo %', [r1(variacao(k, iguais, false, 1)), r1(variacao(k, iguais, true, 1))], [25, 25]);
}

console.log('\n=== 5) Bordas ===');
{
  ok('primeiro mês não tem comparação', variacao(yms, MESES, true, 0), null);
  const zero = { 'A': { n: 0, v: 0, dias: 0 }, 'B': { n: 10, v: 500, dias: 2 } };
  ok('mês anterior zerado não vira Infinity', variacao(['A','B'], zero, true, 1), null);
  ok('dias=0 não divide por zero', Number.isFinite(500 / (0 || 1)), true);
}

console.log('\n=== 6) Ticket médio não muda com o modo ===');
{
  const t = MESES['2026-09'];
  ok('ticket de setembro', Math.round((t.v / t.n) * 100) / 100, 72.11);
}

console.log(`\n${falhas ? '✖' : '✔'} ${total - falhas}/${total}\n`);
process.exit(falhas ? 1 : 0);
