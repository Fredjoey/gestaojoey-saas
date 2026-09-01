/**
 * TESTE — cronômetro do card para quando o pedido chega em "Entregues hoje".
 *
 * Não reimplementa a lógica: EXTRAI as funções reais do painel.html (_tsMs, _mmss,
 * _timerParadoEm, _timerEntregaInfo, _timerPillHtml, _parseTempo) e as roda com pedidos
 * falsos. Se alguém mexer no pill e o cronômetro voltar a contar depois de entregue,
 * o teste quebra.
 *
 * Uso: node scripts/testar_cronometro_entregues.js
 */
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'painel.html'), 'utf8');

// Extrai uma função inteira pelo nome, contando chaves.
function pegaFuncao(nome) {
  const i = SRC.indexOf('function ' + nome + '(');
  if (i < 0) throw new Error('não achei a função ' + nome + ' no painel.html');
  let profundidade = 0;
  for (let k = SRC.indexOf('{', i); k < SRC.length; k++) {
    if (SRC[k] === '{') profundidade++;
    else if (SRC[k] === '}') { profundidade--; if (profundidade === 0) return SRC.slice(i, k + 1); }
  }
  throw new Error('função ' + nome + ' sem fechamento');
}

const codigo = ['_tsMs', '_mmss', '_timerParadoEm', '_timerEntregaInfo', '_timerPillHtml', '_parseTempo']
  .map(pegaFuncao).join('\n\n');

// config do painel: delivery prometido em até 60 min, retirada em até 30.
const config = { tempo_delivery: '40 a 60 min', tempo_retirada: '20 a 30 min' };
const painel = new Function('config',
  codigo + '\nreturn { _timerParadoEm, _timerEntregaInfo, _timerPillHtml, _mmss };')(config);

const MIN = 60000;
const T0  = Date.parse('2026-09-01T19:00:00-03:00');   // pedido criado às 19:00
const ts  = ms => ({ toMillis: () => ms });            // Timestamp do Firestore
const base = { id: 'P1', entrega: 'delivery', criadoEm: ts(T0), ts: T0 };

let testes = 0, falhas = 0;
function ok(nome, cond, detalhe) {
  testes++;
  if (!cond) falhas++;
  console.log(`   ${cond ? '✅' : '❌'} ${nome}${detalhe ? '   → ' + detalhe : ''}`);
}
const html    = p => painel._timerPillHtml(p);
const texto   = p => (html(p).match(/>([^<]*)<\/span>/) || [, ''])[1];
const cor     = p => (html(p).match(/oc-timer-(green|orange|red)/) || [, '—'])[1];
const contando = p => html(p).includes('data-limite');   // só o pill vivo tem data-limite

console.log('\n1) Colunas que NÃO são "Entregues hoje" — nada pode mudar');
['novo', 'producao', 'pronto'].forEach(st =>
  ok(`status "${st}" segue contando`, contando({ ...base, status: st })));

console.log('\n2) Chegou em "Entregues hoje" (status entregue = saiu p/ entrega)');
const p38 = { ...base, status: 'entregue', saiuParaEntregaEm: ts(T0 + 38 * MIN + 12000) };
ok('parou de contar (sem data-limite)', !contando(p38));
ok('mostra o tempo total fixo', texto(p38) === '✓ 38:12', texto(p38));
ok('verde: dentro dos 60 min prometidos', cor(p38) === 'green', cor(p38));
const p71 = { ...base, status: 'entregue', saiuParaEntregaEm: ts(T0 + 71 * MIN + 5000) };
ok('vermelho e fixo quando estourou o prometido', texto(p71) === '✓ 71:05' && cor(p71) === 'red',
   texto(p71) + ' ' + cor(p71));

console.log('\n3) O número não muda com o passar do tempo (o bug relatado)');
ok('duas leituras seguidas dão o mesmo valor', texto(p38) === texto(p38), texto(p38));
ok('update otimista (ms cru, antes do snapshot) também congela',
   texto({ ...base, status: 'entregue', saiuParaEntregaEm: T0 + 25 * MIN }) === '✓ 25:00');

console.log('\n4) Motoboy confirmou (finalizado + entregueEm) — card fica na mesma coluna');
const pFin = { ...base, status: 'finalizado',
               saiuParaEntregaEm: ts(T0 + 38 * MIN + 12000), entregueEm: ts(T0 + 55 * MIN) };
ok('segue congelado na chegada à coluna, não pula', texto(pFin) === '✓ 38:12', texto(pFin));
ok('não volta a contar', !contando(pFin));

console.log('\n5) Card antigo sem carimbo — escolha: esconder o pill');
ok('entregue sem timestamp nenhum → pill some', html({ ...base, status: 'entregue' }) === '');
ok('fallback p/ entregueEm quando falta saiuParaEntregaEm',
   texto({ ...base, status: 'finalizado', entregueEm: ts(T0 + 50 * MIN) }) === '✓ 50:00');
ok('fallback p/ prontoEm em último caso',
   texto({ ...base, status: 'entregue', prontoEm: T0 + 30 * MIN }) === '✓ 30:00');

console.log('\n6) O que não podia ter mudado');
ok('mesa continua sem cronômetro', html({ ...base, status: 'entregue', mesa: '3' }) === '');
ok('agendado continua sem cronômetro',
   html({ ...base, status: 'novo', agendado: true, dataHoraAgendada: '01/09 20:00' }) === '');
const pRet = { ...base, entrega: 'retirada', status: 'entregue', saiuParaEntregaEm: ts(T0 + 18 * MIN) };
ok('retirada congela igual', texto(pRet) === '✓ 18:00', texto(pRet));
ok('retirada 18 min < 30 prometidos → verde', cor(pRet) === 'green', cor(pRet));
ok('finalizado arquivado (sem entregueEm) não vira pill congelado fantasma',
   contando({ ...base, status: 'finalizado', arquivado: true }));
ok('mm:ss acima de 99 min não quebra', painel._mmss(125 * MIN + 7000) === '125:07',
   painel._mmss(125 * MIN + 7000));

console.log(`\n${falhas ? '❌ ' + falhas + ' falha(s)' : '✅ tudo certo'} — ${testes - falhas}/${testes}\n`);
process.exit(falhas ? 1 : 0);
