/**
 * TESTE — "Fechar conta" não pode gravar dois jogos de fechamentos.
 *
 * Não reimplementa a lógica: EXTRAI `contaFechar`, `_fechamentoId` e
 * `_fechamentosRecentesDaMesa` do painel.html e roda num sandbox com `db`,
 * `firebase` e o resto dos globais simulados.
 *
 * Cenários:
 *   1. clique único                       → 2 documentos (a conta tem 2 pagamentos)
 *   2. duplo clique SIMULTÂNEO            → trava de reentrância barra o 2º
 *   3. 2ª chamada no MESMO minuto         → id determinístico reescreve, não duplica
 *   4. 2ª chamada na VIRADA de minuto     → varredura dos 3 min pega
 *   5. conta com 2 pagamentos IGUAIS      → grava os dois (não pode comer um)
 *
 * Uso: node scripts/testar_fechar_conta_duplo.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'painel.html'), 'utf8');

function pegaFuncao(nome) {
  let i = SRC.indexOf('function ' + nome + '(');
  if (i < 0) throw new Error('não achei ' + nome);
  // `async function X` — sem isso o corte perde o `async` e o await quebra.
  if (SRC.slice(Math.max(0, i - 6), i) === 'async ') i -= 6;
  let d = 0;
  for (let k = SRC.indexOf('{', i); k < SRC.length; k++) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}') { d--; if (d === 0) return SRC.slice(i, k + 1); }
  }
  throw new Error(nome + ' sem fechamento');
}

let testes = 0, falhas = 0;
function ok(nome, cond, detalhe) {
  testes++; if (!cond) falhas++;
  console.log(`   ${cond ? '✅' : '❌'} ${nome}${detalhe ? '   → ' + detalhe : ''}`);
}

// ── sandbox ──────────────────────────────────────────────────────────────────
function montar({ pagamentos, agora }) {
  const store = new Map();          // id -> doc
  let relogio = agora;

  const colecao = (p) => ({
    doc: (id) => ({
      set: async (d) => { store.set(p + '/' + id, { ...d, timestamp: { toMillis: () => relogio } }); },
      update: async () => {},
    }),
    where: () => ({
      get: async () => ({
        docs: [...store.entries()]
          .filter(([k]) => k.startsWith(p + '/'))
          .map(([, v]) => ({ data: () => v })),
      }),
    }),
    add: async (d) => { store.set(p + '/auto-' + Math.random(), d); },
  });

  const ctx = {
    console, Date, Number, String, Math, Promise, Set, JSON,
    slug: 'joey',
    db: { collection: colecao },
    firebase: { firestore: { FieldValue: { serverTimestamp: () => ({ toMillis: () => relogio }) } } },
    notify: () => {},
    confirm: () => true,
    closeOrderModal: () => {},
    pedidos: [],
    _contaTotais: () => ({ total: pagamentos.reduce((s, p) => s + p.valor, 0),
                           pago:  pagamentos.reduce((s, p) => s + p.valor, 0),
                           saldoRaw: 0, pagamentos }),
    _pedidosDaMesa: () => [],
    _mesaPedidoAtivo: () => false,
    _mesaAlocarFormas: () => new Map(),
    _mesaUpdatePedido: () => ({}),
    _store: store,
    _avancarRelogio: (ms) => { relogio += ms; },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(
    'const _mesasFechando = new Set();\n\n'
    + [pegaFuncao('_fechamentoId'), pegaFuncao('_fechamentosRecentesDaMesa'), pegaFuncao('contaFechar')].join('\n\n'),
    ctx);
  return ctx;
}

const nFech = (ctx) => [...ctx._store.keys()].filter(k => k.includes('/fechamentos/')).length;
const PAG2 = [{ valor: 100, forma: 'dinheiro', descricao: 'Itens: 1x X-Bacon' },
              { valor: 50,  forma: 'debito',   descricao: 'Itens: 1x Fritas' }];

(async () => {
  console.log('\n1) CLIQUE ÚNICO');
  let c = montar({ pagamentos: PAG2, agora: Date.parse('2026-09-02T21:28:10-03:00') });
  await c.contaFechar('mesa-4', 'Mesa 4', null);
  ok('grava um documento por pagamento', nFech(c) === 2, nFech(c) + ' docs');

  console.log('\n2) DUPLO CLIQUE SIMULTÂNEO (a trava de reentrância)');
  c = montar({ pagamentos: PAG2, agora: Date.parse('2026-09-02T21:28:10-03:00') });
  await Promise.all([c.contaFechar('mesa-4', 'Mesa 4', null), c.contaFechar('mesa-4', 'Mesa 4', null)]);
  ok('continua com 2 docs, não 4', nFech(c) === 2, nFech(c) + ' docs');

  console.log('\n3) SEGUNDA CHAMADA NO MESMO MINUTO (id determinístico)');
  c = montar({ pagamentos: PAG2, agora: Date.parse('2026-09-02T21:28:10-03:00') });
  await c.contaFechar('mesa-4', 'Mesa 4', null);
  await c.contaFechar('mesa-4', 'Mesa 4', null);      // trava já liberada
  ok('reescreve em vez de duplicar', nFech(c) === 2, nFech(c) + ' docs');

  console.log('\n4) SEGUNDA CHAMADA NA VIRADA DE MINUTO (varredura dos 3 min)');
  c = montar({ pagamentos: PAG2, agora: Date.parse('2026-09-02T21:28:59-03:00') });
  await c.contaFechar('mesa-4', 'Mesa 4', null);
  c._avancarRelogio(3000);                            // 21:29:02 — id mudaria
  await c.contaFechar('mesa-4', 'Mesa 4', null);
  ok('a varredura barra o duplicado', nFech(c) === 2, nFech(c) + ' docs');

  console.log('\n5) CONTA COM DOIS PAGAMENTOS IGUAIS (não pode comer um)');
  const iguais = [{ valor: 17, forma: 'dinheiro', descricao: 'Itens: 1x Fritas Joey' },
                  { valor: 17, forma: 'dinheiro', descricao: 'Itens: 1x Fritas Joey' }];
  c = montar({ pagamentos: iguais, agora: Date.parse('2026-09-02T21:28:10-03:00') });
  await c.contaFechar('mesa-4', 'Mesa 4', null);
  ok('grava os DOIS pagamentos idênticos', nFech(c) === 2, nFech(c) + ' docs');
  const soma = [...c._store.values()].reduce((s, d) => s + (d.total || 0), 0);
  ok('soma preservada (R$ 34)', soma === 34, 'R$ ' + soma);

  console.log('\n6) ID É DETERMINÍSTICO E LEGÍVEL');
  const id1 = c._fechamentoId('mesa-4', '02/09/2026', '21:28', 0);
  const id2 = c._fechamentoId('mesa-4', '02/09/2026', '21:28', 0);
  ok('mesma entrada → mesmo id', id1 === id2, id1);
  ok('índice diferencia pagamentos da mesma conta',
     c._fechamentoId('mesa-4', '02/09/2026', '21:28', 1) !== id1);
  ok('minuto diferente → id diferente',
     c._fechamentoId('mesa-4', '02/09/2026', '21:29', 0) !== id1);

  console.log(`\n${falhas ? '❌ ' + falhas + ' falha(s)' : '✅ tudo certo'} — ${testes - falhas}/${testes}\n`);
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
