// ── PREÇO CANÔNICO DO ITEM ───────────────────────────────────────────────────
// Mesma fórmula usada no painel.html / cardapio.html / garcom.html:
//
//   unitário = preço base + Σ (adicional.preco × adicional.qty)
//   total do item = unitário × item.qty
//
// NÃO usar `precoTotal`: campo derivado, gravado só pelo Novo Pedido do painel.
// Pedido vindo do cardápio, garçom, mesa ou WhatsApp não tem o campo — confiar
// nele fazia os adicionais sumirem do total.
//
// Usada também na NFC-e (functions/index.js) para o valor unitário do item, de
// modo que a nota declare o valor real da venda.
//
// ⚠️ ESCOPO FISCAL: a NFC-e inclui os ADICIONAIS, mas continua SEM a taxa de
// entrega (valor_frete: 0) e SEM o desconto do pedido — isso é PROPOSITAL,
// decisão pendente com o contador. Não mexer sem ele pedir.

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
