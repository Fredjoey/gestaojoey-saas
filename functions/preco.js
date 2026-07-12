// ── PREÇO CANÔNICO DO ITEM ───────────────────────────────────────────────────
// Fonte única de verdade do preço de um item de pedido, espelhando a mesma
// fórmula do painel/cardápio/garçom:
//
//   unitário = preço base + Σ (adicional.preco × adicional.qty)
//   total do item = unitário × item.qty
//
// NÃO usar `precoTotal`: campo derivado, gravado só por alguns fluxos antigos do
// painel. Pedido vindo do cardápio, garçom, mesa ou WhatsApp não tem o campo —
// confiar nele fazia os adicionais sumirem do total (e da NFC-e).

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
