/**
 * TESTE — preço canônico do item (base + adicionais) e os totais que dependem dele.
 *
 * Não reimplementa a fórmula: EXTRAI a função canônica dos arquivos reais
 * (painel.html, cardapio.html, garcom.html) e importa functions/preco.js — o mesmo
 * código que vai pro ar. Se as 4 cópias divergirem, o teste quebra.
 *
 * Uso: node scripts/testar_preco_canonico.js
 */
const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const ROOT = path.join(__dirname, '..');
let falhas = 0, testes = 0;

function check(nome, real, esperado) {
  testes++;
  const ok = Math.abs(Number(real) - Number(esperado)) < 0.005;
  if (!ok) falhas++;
  console.log(`   ${ok ? '✅' : '❌'} ${nome}: ${Number(real).toFixed(2)}${ok ? '' : '  ← esperado ' + Number(esperado).toFixed(2)}`);
}

// Extrai as 3 funções canônicas do HTML e as executa num sandbox
function carregarDoHtml(arquivo) {
  const src = fs.readFileSync(path.join(ROOT, arquivo), 'utf8');
  const m = src.match(/function precoUnitario[\s\S]*?function subtotalItens\([^)]*\)\s*\{[^}]*\}/);
  if (!m) throw new Error(`função canônica não encontrada em ${arquivo}`);
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(m[0] + '; this.api = { precoUnitario, totalItem, subtotalItens };', ctx);
  return ctx.api;
}

const impls = {
  'painel.html':      carregarDoHtml('painel.html'),
  'cardapio.html':    carregarDoHtml('cardapio.html'),
  'garcom.html':      carregarDoHtml('garcom.html'),
  'scripts/preco.js': require('./preco'),
};

// ── Pedido 34156 (reconstruído): 3 itens, adicionais só no 2º ────────────────
// Itens no formato que o cardápio/garçom/mesa/WhatsApp gravam: SEM `precoTotal`.
const ADICS_BACON = [
  { id: 'a1', nome: 'Cebola',       preco: 4, qty: 1 },
  { id: 'a2', nome: 'Catupiry',     preco: 5, qty: 1 },
  { id: 'a3', nome: 'Cebola crisp', preco: 4, qty: 1 },
];
const PEDIDO_34156 = [
  { id: 1, nome: 'X-Salada',     preco: 32, qty: 1, adicionais: [] },
  { id: 2, nome: 'Bacon Duplo',  preco: 45, qty: 1, adicionais: ADICS_BACON },   // +13 de adicionais
  { id: 3, nome: 'Batata Frita', preco: 20, qty: 1, adicionais: [] },
];
const GUARANA = { id: 4, nome: 'Guaraná Lata', preco: 6, qty: 1, adicionais: [] };

// Fórmula ANTIGA (a que causava o bug): confiava em precoTotal, ignorava adicionais
const subtotalAntigo = itens =>
  itens.reduce((s, i) => s + (i.precoTotal != null ? i.precoTotal : i.preco) * i.qty, 0);

console.log('\n══ 1. As 4 cópias da função canônica concordam? ══\n');
const CASOS = [
  ['item sem adicionais',              { preco: 45, qty: 1, adicionais: [] },                                    45],
  ['item + 3 adicionais (4+5+4)',      { preco: 45, qty: 1, adicionais: ADICS_BACON },                           58],
  ['adicional com qty 2 (bacon 2x)',   { preco: 45, qty: 1, adicionais: [{ preco: 5, qty: 2 }] },                55],
  ['adicional SEM campo qty (=1)',     { preco: 45, qty: 1, adicionais: [{ preco: 5 }] },                        50],
  ['item qty 2 (adicionais × qty)',    { preco: 45, qty: 2, adicionais: ADICS_BACON },                          116],
  ['adicional grátis (grupo, preço 0)',{ preco: 30, qty: 1, adicionais: [{ preco: 0, qty: 1 }] },                30],
];
for (const [nome, item, esperado] of CASOS) {
  const vals = Object.entries(impls).map(([f, api]) => [f, api.totalItem(item)]);
  const divergiu = vals.some(([, v]) => Math.abs(v - vals[0][1]) > 0.005);
  testes++;
  if (divergiu) { falhas++; console.log(`   ❌ ${nome}: cópias divergem → ${JSON.stringify(vals)}`); }
  else check(nome, vals[0][1], esperado);
}

console.log('\n══ 2. Pedido 34156 — o bug relatado ══\n');
const api = impls['painel.html'];
console.log(`   Pedido original (3 itens, adicionais 4+5+4 no Bacon Duplo):`);
check('total original', api.subtotalItens(PEDIDO_34156), 110);

const comGuarana = [...PEDIDO_34156, GUARANA];
console.log(`\n   Depois de ADICIONAR o Guaraná Lata (R$ 6):`);
console.log(`   ↳ fórmula ANTIGA (precoTotal ?? preco) daria: R$ ${subtotalAntigo(comGuarana).toFixed(2)}  ← o bug (R$ 103)`);
check('total corrigido (epConfirmar → subtotalItens)', api.subtotalItens(comGuarana), 116);
testes++;
if (Math.abs(subtotalAntigo(comGuarana) - 103) > 0.005) { falhas++; console.log('   ❌ a fórmula antiga não reproduz o R$ 103 relatado'); }
else console.log('   ✅ a fórmula antiga reproduz exatamente o R$ 103 relatado (confirma o diagnóstico)');

console.log('\n══ 3. Editar quantidade (Bacon Duplo 1 → 2) ══\n');
const qtyEditada = PEDIDO_34156.map(i => i.id === 2 ? { ...i, qty: 2 } : i);
console.log(`   ↳ fórmula ANTIGA daria: R$ ${subtotalAntigo(qtyEditada).toFixed(2)}`);
check('total corrigido (32 + 58×2 + 20)', api.subtotalItens(qtyEditada), 168);

console.log('\n══ 4. Pedir novamente (copia itens do pedido) ══\n');
const copiado = PEDIDO_34156.map(i => ({
  id: i.id, nome: i.nome, preco: i.preco || 0, qty: i.qty || 1, obs: '',
  adicionais: (i.adicionais || []).map(a => ({ ...a })),
}));
console.log(`   ↳ fórmula ANTIGA daria: R$ ${subtotalAntigo(copiado).toFixed(2)}`);
check('total do pedido repetido', api.subtotalItens(copiado), 110);
testes++;
const isolado = (copiado[1].adicionais !== PEDIDO_34156[1].adicionais)
             && (copiado[1].adicionais[0] !== PEDIDO_34156[1].adicionais[0]);
if (!isolado) { falhas++; console.log('   ❌ adicionais copiados por referência (mutação vazaria pro pedido original)'); }
else console.log('   ✅ adicionais copiados em profundidade (não mutam o pedido original)');

console.log('\n══ 5. NFC-e — NÃO alterada (decisão fiscal pendente com o contador) ══\n');
const fnSrc = fs.readFileSync(path.join(ROOT, 'functions/index.js'), 'utf8');
testes++;
if (/precoUnitario|require\(['"]\.\/preco['"]\)/.test(fnSrc)) {
  falhas++;
  console.log('   ❌ functions/index.js está usando o preço canônico — a NFC-e NÃO deve ter sido tocada');
} else {
  console.log('   ✅ functions/index.js intacto: nota segue com o preço base do item (sem adicionais)');
}

console.log('\n══ 6. Mesa/comanda — adicional com qty > 1 (bug do a.qty ignorado) ══\n');
const itemMesa = { preco: 45, qty: 1, adicionais: [{ nome: 'Catupiry', preco: 5, qty: 2 }] };
const antigoComanda = ((itemMesa.preco || 0) + itemMesa.adicionais.reduce((s, a) => s + (a.preco || 0), 0)) * itemMesa.qty;
console.log(`   ↳ fórmula ANTIGA da comanda (ignorava a.qty) daria: R$ ${antigoComanda.toFixed(2)}`);
check('linha da comanda (45 + 5×2)', api.totalItem(itemMesa), 55);

console.log('\n' + '─'.repeat(60));
console.log(`${falhas === 0 ? '✅ TODOS OS TESTES PASSARAM' : '❌ ' + falhas + ' FALHA(S)'} — ${testes - falhas}/${testes}`);
process.exit(falhas === 0 ? 0 : 1);
