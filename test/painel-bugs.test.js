// Bugs do painel e do app do motoboy corrigidos em 20/10/2026 (branch fix/bugs-painel). Cada teste falhava no master
// 3c0d204 e passa depois da correção. Roda com `npm test` (node --test), sem rede e sem Firebase de verdade.
const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar, snapshot, esperar } = require('./sandbox');

const hoje = () => new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
const itens = [{ qty: 2, nome: 'X-Burger', preco: 20, adicionais: [{ nome: 'Bacon', preco: 3, qty: 1 }], obs: 'sem cebola' }, { qty: 1, nome: 'Coca Lata', preco: 6 }];
const cli = { nome: 'Ana', tel: '21999990000', rua: 'Rua A', numero: '10', bairro: 'Centro', ref: 'portão azul' };

// Pedidos de cada tipo (os mesmos formatos que o cardápio, o salão e o joey-ifood gravam).
function pedidos() {
  const base = { data: hoje(), hora: '19:00', ts: Date.now(), itens, subtotal: 52, total: 57, taxaEntrega: 5 };
  return {
    delivery: { ...base, id: '101', cliente: cli, pagamento: 'dinheiro', troco: 100, status: 'producao', entrega: 'delivery', origem: 'cardapio' },
    retirada: { ...base, id: '102', cliente: { nome: 'Bia', tel: '21988880000' }, pagamento: 'credito', status: 'novo', entrega: 'retirada', origem: 'cardapio', taxaEntrega: 0, total: 52 },
    mesa: { ...base, id: '103', cliente: { nome: 'Mesa 4' }, pagamento: 'local', status: 'producao', entrega: 'local', tipo: 'mesa', mesa: '4', mesaNome: 'Mesa 4', origem: 'salao', taxaEntrega: 0, total: 52 },
    pixOnline: { ...base, id: '104', cliente: cli, pagamento: 'pix', pixStatus: 'pendente', pixExpira: Date.now() + 300000, status: 'novo', entrega: 'delivery', origem: 'cardapio' },
    pixTrocado: { ...base, id: '105', cliente: cli, pagamento: 'pix', pagamentoManual: true, formaPagamentoAnterior: 'pix', status: 'novo', entrega: 'delivery', origem: 'cardapio' },
    ifoodOnline: { ...base, id: '106', cliente: { ...cli, tel: '' }, pagamento: 'ifood', status: 'novo', entrega: 'delivery', origem: 'ifood', ifoodOrderId: 'o-106', ifoodDisplayId: '1234', ifoodTipo: 'DELIVERY', ifoodEntregaPor: 'MERCHANT', ifoodPagamento: { online: true, metodos: [{ tipo: 'ONLINE', metodo: 'CREDIT', valor: 57 }] } },
    // Pix OFFLINE do iFood (cobrar na entrega): o joey-ifood grava pagamento 'pix', sem pixStatus (não há QR do Mercado Pago).
    ifoodPixOffline: { ...base, id: '107', cliente: { ...cli, tel: '' }, pagamento: 'pix', status: 'novo', entrega: 'delivery', origem: 'ifood', ifoodOrderId: 'o-107', ifoodDisplayId: '5678', ifoodTipo: 'DELIVERY', ifoodEntregaPor: 'MERCHANT', ifoodPagamento: { online: false, metodos: [{ tipo: 'OFFLINE', metodo: 'PIX', valor: 57 }] } },
  };
}

function painel() {
  const a = carregar('painel.html');
  a.rodar("slug = 'teste'");
  return a;
}
const card = (a, p) => { a.ctx.__p = p; return a.rodar('orderCardHtml(__p)'); };
const modal = (a, p) => {
  a.ctx.__p = p;
  a.rodar('pedidos = [__p]; openOrderModal(__p.id)');
  return a.elementos.modalBody.innerHTML;
};

// ── 1. Pix OFFLINE do iFood não pode ficar preso esperando o Pix ─────────────────────────────────────────────────
test('bug 1: pedido do iFood com Pix OFFLINE segue como pago fora do app (não trava esperando o Pix)', () => {
  const a = painel();
  const P = pedidos();
  a.ctx.__p = P.ifoodPixOffline;
  assert.equal(a.rodar('_pixLockState(__p).locked'), false, 'não pode travar o card');
  const c = card(a, P.ifoodPixOffline);
  assert.match(c, /Confirmar → Produção/);
  assert.doesNotMatch(c, /Aguardando pagamento Pix/);
  assert.doesNotMatch(c, /Gerando PIX/);
  assert.match(c, /PIX \(na entrega\)/);
  const m = modal(a, P.ifoodPixOffline);
  assert.match(m, /Confirmar → Produção/);
  assert.match(m, /PIX \(na entrega\)/);
  // auto-aceito pelo serviço: em produção, sem tarja de Pix e sem "PIX OK" (o Pix ainda vai ser cobrado)
  const prod = { ...P.ifoodPixOffline, status: 'producao', autoAceito: true };
  const cp = card(a, prod);
  assert.doesNotMatch(cp, /Gerando PIX/);
  assert.doesNotMatch(cp, /PIX OK/);
  assert.match(cp, />AUTO</);
});

test('bug 1 (controle): Pix online do cardápio continua travado; o trocado na mão e o iFood online não mudam', () => {
  const a = painel();
  const P = pedidos();
  a.ctx.__p = P.pixOnline;
  assert.equal(a.rodar('_pixLockState(__p).locked'), true);
  assert.match(card(a, P.pixOnline), /Aguardando pagamento Pix/);
  a.ctx.__p = P.pixTrocado;
  assert.equal(a.rodar('_pixLockState(__p).locked'), false);
  assert.match(card(a, P.pixTrocado), /PIX \(na entrega\)/);
  assert.match(card(a, P.ifoodOnline), /IFOOD<\/span>/);
});

// ── 2. Código de entrega cria a nota pendente, como a conclusão manual ───────────────────────────────────────────
test('bug 2: entrega própria concluída pelo código de entrega cria a nota pendente', async () => {
  const a = painel();
  a.rodar('iniciarListenersFirestore()');
  const lis = a.fs.listeners.find((l) => l.path === 'clientes/teste/pedidos');
  assert.ok(lis, 'listener de pedidos');
  const pronto = { ...pedidos().ifoodOnline, id: '201', status: 'pronto', prontoEm: Date.now() - 60000 };
  lis.cb(snapshot([pronto]));
  await esperar();
  // validado em "Prontos" (painel ou app do motoboy): o serviço grava finalizado + entregueEm + ifoodCodigoEntregaValidado
  const agora = { toMillis: () => Date.now() };
  lis.cb(snapshot([{ ...pronto, status: 'finalizado', entregueEm: agora, ifoodCodigoEntregaValidado: { em: agora, por: 'motoboy', papel: 'entregador' } }]));
  await esperar(); await esperar();
  const nota = a.fs.escritas.find((e) => e.op === 'set' && e.path === 'clientes/teste/notasFiscais/201');
  assert.ok(nota, 'nota pendente criada');
  assert.equal(nota.data.status, 'pendente');
  assert.equal(nota.data.pedidoId, '201');
  // de novo o mesmo snapshot: não cria outra vez
  lis.cb(snapshot([{ ...pronto, status: 'finalizado', entregueEm: agora, ifoodCodigoEntregaValidado: { em: agora } }]));
  await esperar(); await esperar();
  assert.equal(a.fs.escritas.filter((e) => e.path === 'clientes/teste/notasFiscais/201').length, 1);
});

test('bug 2 (controle): a conclusão manual cria a nota como antes; pedido sem código e código antigo não criam pelo snapshot', async () => {
  const a = painel();
  a.rodar('iniciarListenersFirestore()');
  const lis = a.fs.listeners.find((l) => l.path === 'clientes/teste/pedidos');
  const P = pedidos();
  const ontem = { toMillis: () => Date.now() - 3 * 86400000 };
  lis.cb(snapshot([
    { ...P.delivery, id: '301', status: 'finalizado', entregueEm: { toMillis: () => Date.now() } },            // "Entreguei" do motoboy
    { ...P.ifoodOnline, id: '302', status: 'finalizado', entregueEm: ontem, ifoodCodigoEntregaValidado: { em: ontem } }, // de dias atrás
  ]));
  await esperar(); await esperar();
  assert.equal(a.fs.escritas.filter((e) => e.path.includes('/notasFiscais/')).length, 0);
  // manual: "Enviar para entrega" de um pedido normal em Prontos → 'entregue' → nota pendente
  a.ctx.__p = { ...P.delivery, id: '303', status: 'pronto' };
  a.rodar('pedidos = [__p]; avancarStatus("303")');
  await esperar(); await esperar();
  assert.ok(a.fs.escritas.find((e) => e.op === 'set' && e.path === 'clientes/teste/notasFiscais/303'));
});

// ── 3. Modal de pedido 'finalizado' (e qualquer outro status) abre ───────────────────────────────────────────────
test('bug 3: o modal abre para pedido finalizado e para todos os status', () => {
  const a = painel();
  const base = pedidos().delivery;
  for (const status of ['novo', 'confirmado', 'producao', 'pronto', 'entregue', 'finalizado', 'cancelado', 'desconhecido']) {
    const m = modal(a, { ...base, status, entregueEm: status === 'finalizado' ? Date.now() : undefined });
    assert.match(m, /Status/, status);
  }
  const f = modal(a, { ...base, status: 'finalizado', entregueEm: Date.now() });
  assert.match(f, /Finalizado/);
  assert.doesNotMatch(f, />Cancelar</, 'pedido finalizado não oferece cancelar');
  // o card do finalizado (Entregues hoje) segue igual
  assert.match(card(a, { ...base, status: 'finalizado', entregueEm: Date.now() }), /Finalizar pedido/);
});

// ── 4. Card e modal escapam o que vem do cliente / da plataforma ─────────────────────────────────────────────────
test('bug 4: card e modal escapam nome, endereço, itens e observações (sem estragar acentos e emojis)', () => {
  const a = painel();
  const P = pedidos();
  const mau = '<img src=x onerror=alert(1)>';
  const malicioso = (p) => ({
    ...p,
    hora: '19:00<b>h</b>',
    cliente: { ...p.cliente, nome: 'Conceição 🍔 & Cia ' + mau, rua: '<b>Rua</b>', numero: '1<i>', bairro: '<u>Centro</u>', comp: '<s>apto</s>', ref: '<script>x()</script>' },
    itens: [{ qty: 1, nome: 'X-Tudo <svg onload=alert(2)>', emoji: '🍔', preco: 10, obs: 'sem <em>cebola</em>', adicionais: [{ nome: '<marquee>Bacon', grupo: '<h1>Extras', preco: 2, qty: 1 }] }],
  });
  for (const k of ['delivery', 'retirada', 'mesa', 'ifoodOnline', 'ifoodPixOffline']) {
    const p = malicioso(P[k]);
    for (const [onde, html] of [['card', card(a, p)], ['modal', modal(a, p)]]) {
      for (const tag of ['<img', '<b>', '<i>', '<u>', '<s>', '<script', '<svg', '<em>', '<marquee', '<h1']) assert.ok(!html.includes(tag), `${k}/${onde}: ${tag} cru`);
      assert.match(html, /Conceição 🍔 &amp; Cia &lt;img/, `${k}/${onde}: nome escapado com acento e emoji`);
    }
  }
  // id do pedido (o cardápio grava o campo id) não fecha a string de nenhum onclick/onchange
  const inj = { ...P.delivery, id: "1');alert(3);('", status: 'pronto', entregadorId: 'm1', entregadorNome: 'João' };
  a.rodar("_motoboysAtivos = [{ id: 'm1', nome: 'João', plantaoEm: Date.now() }]");
  for (const html of [card(a, inj), modal(a, inj), card(a, { ...inj, entregadorId: null })]) {
    const handlers = [...html.matchAll(/\bon[a-z]+="([^"]*)"/g)].map((m) => m[1]);
    assert.ok(handlers.length > 0);
    for (const h of handlers) assert.ok(!h.includes('alert(3)'), 'id cru num handler: ' + h);
  }
});

// ── 5. App do motoboy: "Pix · pago" só para Pix pago de verdade ──────────────────────────────────────────────────
test('bug 5: o app do motoboy mostra Pix na entrega (a receber) no pix trocado na mão e no Pix offline do iFood', () => {
  const a = carregar('entregador.html', { busca: '' });
  const c = { nome: 'Ana', rua: 'Rua A', numero: '1', bairro: 'Centro', tel: '' };
  const um = (p) => { a.ctx.__l = [{ id: '1', status: 'pronto', cliente: c, itens: [{ qty: 1, nome: 'X' }], total: 30, ...p }]; a.rodar('render(__l)'); return a.elementos.conteudo.innerHTML; };
  const trocado = um({ pagamento: 'pix', pagamentoManual: true });
  assert.match(trocado, /Pix na entrega · receber/);
  assert.doesNotMatch(trocado, /Pix · pago/);
  const ifoodPix = um({ pagamento: 'pix', origem: 'ifood', ifoodOrderId: 'o', ifoodTipo: 'DELIVERY', ifoodEntregaPor: 'MERCHANT' });
  assert.match(ifoodPix, /Pix na entrega · receber/);
  // controle: Pix pago no cardápio, dinheiro, cartão e iFood online não mudam
  assert.match(um({ pagamento: 'pix', pixStatus: 'pago' }), /Pix · pago/);
  assert.match(um({ pagamento: 'dinheiro', troco: 50 }), /Dinheiro · troco p\/ R\$ 50,00 · receber/);
  assert.match(um({ pagamento: 'credito' }), /Cartão na entrega · receber/);
  assert.match(um({ pagamento: 'ifood', origem: 'ifood', ifoodOrderId: 'o' }), /Pago no iFood/);
});
