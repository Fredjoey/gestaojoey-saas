// ── PREÇO CANÔNICO DO ITEM (referência p/ scripts: auditoria e teste) ────────
// Espelha a mesma fórmula usada no painel.html / cardapio.html / garcom.html:
//
//   unitário = preço base + Σ (adicional.preco × adicional.qty)
//   total do item = unitário × item.qty
//
// NÃO usar `precoTotal`: campo derivado, gravado só pelo Novo Pedido do painel.
// Pedido vindo do cardápio, garçom, mesa ou WhatsApp não tem o campo — confiar
// nele fazia os adicionais sumirem do total.
//
// ⚠️ A NFC-e (functions/index.js) NÃO usa esta fórmula: ela continua emitindo a
// nota só com o preço base do item (adicionais, taxa de entrega e desconto ficam
// de fora). Isso é PROPOSITAL — decisão fiscal pendente com o contador.

function precoUnitario(item) {
  if (!item) return 0;
  const base = Number(item.preco != null ? item.preco : item.price) || 0;
  const adics = (item.adicionais || []).reduce(
    (s, a) => s + (Number(a && a.preco) || 0) * (Number(a && a.qty != null ? a.qty : 1) || 0),
    0
  );
  return base + adics;
}

function totalItem(item) {
  const qty = Number(item && (item.qty != null ? item.qty : item.quantidade)) || 1;
  return precoUnitario(item) * qty;
}

function subtotalItens(itens) {
  return (itens || []).reduce((s, i) => s + totalItem(i), 0);
}

module.exports = { precoUnitario, totalItem, subtotalItens };
