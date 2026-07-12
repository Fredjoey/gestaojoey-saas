/**
 * TESTE — payload da NFC-e (NÃO emite nada, NÃO fala com a Focus/SEFAZ).
 *
 * Não reimplementa a montagem do payload: EXTRAI do functions/index.js o trecho
 * real que monta `items` + `pagObj` + `nfcePayload` e o executa num sandbox, com
 * a config fiscal fake. Roda o MESMO trecho nas duas versões:
 *
 *   ANTES = functions/index.js do commit 4898178 (o que está em produção hoje)
 *   DEPOIS = functions/index.js da árvore de trabalho (com adicionais)
 *
 * Assim dá pra ver exatamente o que muda no JSON que iria pra Focus.
 *
 * Uso: node scripts/testar_nfce_payload.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..');
const COMMIT_PROD = '4898178';                 // versão hoje em produção (só preço base)
let falhas = 0, testes = 0;

// Config fiscal fake — só o suficiente pro payload montar
const FISCAL = { cnpj: '12.345.678/0001-99', ie: '123456789', telefone: '2422334455',
                 regime: 'simples', csc: 'CSC-FAKE', idCsc: '1', serieNfce: 2 };
const CAT_TRIB = {};                            // vazio → cai nos CAT_DEFAULTS do código
const NCM_PRODUTOS = {};

// Extrai do source o trecho que monta o payload e executa de verdade
function montarPayload(fonteJs, itens, pagamento) {
  const pega = (re, nome) => {
    const m = fonteJs.match(re);
    if (!m) throw new Error(`não achei ${nome} no source`);
    return m[0];
  };
  const mapFormaPag = pega(/function mapFormaPagamento[\s\S]*?\n}/, 'mapFormaPagamento');
  const catDefaults = pega(/const CAT_DEFAULTS = \{[\s\S]*?\n\};/, 'CAT_DEFAULTS');
  const getTrib     = pega(/function getTrib[\s\S]*?\n}/, 'getTrib');
  // do `const items = itens.map(` até o fim do objeto nfcePayload
  const bloco       = pega(/const items = itens\.map\([\s\S]*?formas_pagamento: \[pagObj\],\s*\};/, 'bloco do payload');

  const ctx = {
    itens, pagamento, req: { body: {} },
    dataEmissao: '2026-07-12T10:00:00-03:00',
    fiscal: FISCAL, catTrib: CAT_TRIB, ncmProdutos: NCM_PRODUTOS,
    precoUnitario: require('../functions/preco').precoUnitario,   // usado só pela versão nova
    parseFloat, Object, String, Number,
  };
  vm.createContext(ctx);
  vm.runInContext(`${mapFormaPag}\n${catDefaults}\n${getTrib}\n${bloco}\nthis.out = { nfcePayload, totalItens };`, ctx);
  return ctx.out;
}

const fonteNova  = fs.readFileSync(path.join(ROOT, 'functions/index.js'), 'utf8');
const fonteProd  = cp.execSync(`git show ${COMMIT_PROD}:functions/index.js`, { cwd: ROOT }).toString();

function check(nome, real, esperado) {
  testes++;
  const ok = Math.abs(Number(real) - Number(esperado)) < 0.005;
  if (!ok) falhas++;
  console.log(`   ${ok ? '✅' : '❌'} ${nome}: ${Number(real).toFixed(2)}${ok ? '' : '  ← esperado ' + Number(esperado).toFixed(2)}`);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n══ CASO 1 — pedido COM adicionais (o caso do enunciado) ══\n');
const PEDIDO_COM_ADICS = [{
  id: 7, nome: 'Bacon Duplo', categoria: 'burger', preco: 34, qty: 1,
  adicionais: [
    { nome: 'Cebola caramelizada', preco: 4, qty: 1 },
    { nome: 'Catupiry',            preco: 5, qty: 1 },
    { nome: 'Cebola crispy',       preco: 4, qty: 1 },
  ],
}];

const antes1  = montarPayload(fonteProd, PEDIDO_COM_ADICS, 'dinheiro');
const depois1 = montarPayload(fonteNova, PEDIDO_COM_ADICS, 'dinheiro');

console.log(`   ANTES  (produção hoje): valor_unitario ${antes1.nfcePayload.items[0].valor_unitario_comercial.toFixed(2)} · valor_bruto ${antes1.nfcePayload.items[0].valor_bruto.toFixed(2)} · TOTAL DA NOTA R$ ${antes1.totalItens.toFixed(2)}  ← subfaturada`);
console.log(`   DEPOIS (correção)     : valor_unitario ${depois1.nfcePayload.items[0].valor_unitario_comercial.toFixed(2)} · valor_bruto ${depois1.nfcePayload.items[0].valor_bruto.toFixed(2)} · TOTAL DA NOTA R$ ${depois1.totalItens.toFixed(2)}\n`);

check('valor_unitario_comercial (34 + 13)', depois1.nfcePayload.items[0].valor_unitario_comercial, 47);
check('valor_bruto do item',                depois1.nfcePayload.items[0].valor_bruto, 47);
check('TOTAL da nota (soma dos itens)',     depois1.totalItens, 47);
check('valor_pagamento',                    depois1.nfcePayload.formas_pagamento[0].valor_pagamento, 47);
check('valor_frete NÃO mudou (segue 0)',    depois1.nfcePayload.valor_frete, antes1.nfcePayload.valor_frete);

console.log('\n   ── PAYLOAD QUE IRIA PRA FOCUS (caso 1, com adicionais) ──');
console.log(JSON.stringify(depois1.nfcePayload, null, 2).split('\n').map(l => '   ' + l).join('\n'));

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n\n══ CASO 2 — pedido SEM adicionais (não pode ter mudado NADA) ══\n');
const PEDIDO_SEM_ADICS = [
  { id: 1, nome: 'Margherita Clássica', categoria: 'pizza',  preco: 45, qty: 2, adicionais: [] },
  { id: 6, nome: 'Coca-Cola 2L',        categoria: 'bebida', preco: 12, qty: 1 },   // sem o campo adicionais
];

const antes2  = montarPayload(fonteProd, PEDIDO_SEM_ADICS, 'pix');
const depois2 = montarPayload(fonteNova, PEDIDO_SEM_ADICS, 'pix');

const igual = JSON.stringify(antes2.nfcePayload) === JSON.stringify(depois2.nfcePayload);
testes++;
if (!igual) {
  falhas++;
  console.log('   ❌ o payload MUDOU num pedido sem adicionais — regressão!');
  console.log('   ANTES :', JSON.stringify(antes2.nfcePayload));
  console.log('   DEPOIS:', JSON.stringify(depois2.nfcePayload));
} else {
  console.log('   ✅ payload byte a byte IDÊNTICO ao de produção (nada quebrou)');
}
check('TOTAL da nota (45×2 + 12)', depois2.totalItens, 102);

console.log('\n   ── PAYLOAD QUE IRIA PRA FOCUS (caso 2, sem adicionais) ──');
console.log(JSON.stringify(depois2.nfcePayload, null, 2).split('\n').map(l => '   ' + l).join('\n'));

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n\n══ CASO 3 — limites fiscais que NÃO podem ter sido tocados ══\n');
testes++;
if (depois1.nfcePayload.valor_frete === 0 && depois2.nfcePayload.valor_frete === 0) {
  console.log('   ✅ valor_frete: 0 nos dois casos — taxa de entrega segue FORA da nota');
} else { falhas++; console.log('   ❌ valor_frete mudou'); }

testes++;
const temDesconto = JSON.stringify(depois1.nfcePayload).toLowerCase().includes('desconto');
if (!temDesconto) console.log('   ✅ nenhum campo de desconto no payload — segue FORA da nota');
else { falhas++; console.log('   ❌ apareceu desconto no payload'); }

console.log('\n' + '─'.repeat(70));
console.log(`${falhas === 0 ? '✅ TODOS OS TESTES PASSARAM' : '❌ ' + falhas + ' FALHA(S)'} — ${testes - falhas}/${testes}`);
console.log('(nenhuma nota foi emitida — nada foi enviado à Focus/SEFAZ)');
process.exit(falhas === 0 ? 0 : 1);
