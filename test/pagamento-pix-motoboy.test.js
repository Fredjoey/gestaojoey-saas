// Achados corrigidos em 20/10/2026 (branch fix/pagamento-pix-motoboy): Pix trocado na mão, aviso de WhatsApp ao motoboy,
// esc() do app do motoboy, texto do cliente cru na comanda/busca/histórico/NFC-e e valor gravado como texto. Cada teste
// falhava no master dc3290f e passa depois da correção. Roda com `npm test`, sem rede e sem Firebase de verdade.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const { carregar, snapshot, esperar } = require('./sandbox');

const hoje = () => new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
const itens = [{ qty: 2, nome: 'X-Burger', preco: 20, adicionais: [{ nome: 'Bacon', preco: 3, qty: 1 }], obs: 'sem cebola' }, { qty: 1, nome: 'Coca Lata', preco: 6 }];
const cli = { nome: 'Ana', tel: '21999990000', rua: 'Rua A', numero: '10', bairro: 'Centro', ref: 'portão azul' };
const base = () => ({ data: hoje(), hora: '19:00', ts: Date.now(), itens, subtotal: 52, total: 57, taxaEntrega: 5, cliente: cli, entrega: 'delivery', origem: 'cardapio' });

function painel(slug = 'teste') {
  const a = carregar('painel.html');
  a.rodar(`slug = '${slug}'`);
  return a;
}
const card = (a, p) => { a.ctx.__p = p; return a.rodar('orderCardHtml(__p)'); };
const desfaz = (s) => String(s).replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

// Aplica um update do Firestore num doc (o FieldValue.delete() do sandbox tira o campo) — o que o snapshot traria depois.
function aplicar(doc, data) {
  const out = { ...doc };
  for (const [k, v] of Object.entries(data)) { if (v && v._sentinela === 'delete') delete out[k]; else out[k] = v; }
  return out;
}

// Relógio do Pix: guarda o callback do setInterval e devolve, no querySelectorAll('[data-pix-expira]'), os elementos que o
// HTML dos cards tem (com removeAttribute de verdade). `tick()` = 1 s do relógio.
function relogioPix(a) {
  const cbs = [];
  let els = [];
  a.ctx.setInterval = (f) => { cbs.push(f); return cbs.length; };
  a.ctx.clearInterval = () => {};
  a.ctx.document.querySelectorAll = (sel) => (sel === '[data-pix-expira]' ? els.filter((e) => e.dataset.pixExpira != null) : []);
  return {
    montar(html) {
      els = [...String(html).matchAll(/data-pix-expira="(\d+)" data-pix-pid="([^"]*)"/g)].map((m) => ({
        dataset: { pixExpira: m[1], pixPid: desfaz(m[2]) }, textContent: '', className: '',
        removeAttribute(n) { if (n === 'data-pix-expira') delete this.dataset.pixExpira; },
      }));
      return els;
    },
    tick() {
      const cb = [...cbs].reverse().find((f) => String(f).includes('data-pix-expira'));   // o do startPixTimers
      assert.ok(cb, 'startPixTimers armou o relógio');
      cb();
    },
  };
}
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const cancelamentos = (a, id) => a.fs.escritas.filter((e) => e.path === `clientes/teste/pedidos/${id}` && e.data && e.data.status === 'cancelado');

// ── 1. Pix trocado na mão para "na entrega" ───────────────────────────────────────────────────────────────────────
test('1a: Pix trocado na mão (sem pixStatus) não mostra "Gerando PIX..."', () => {
  const a = painel();
  const p = { ...base(), id: '105', pagamento: 'pix', pagamentoManual: true, formaPagamentoAnterior: 'dinheiro', status: 'novo' };
  for (const st of ['novo', 'producao', 'pronto', 'entregue']) {
    const c = card(a, { ...p, status: st });
    assert.doesNotMatch(c, /Gerando PIX/, st);
    assert.doesNotMatch(c, /data-pix-expira/, st);
  }
  assert.match(card(a, p), /PIX \(na entrega\)/);
  // controle: Pix online ainda gerando continua com a tarja; Pix pago trocado depois segue "PIX Confirmado"
  assert.match(card(a, { ...p, pagamentoManual: false, pixStatus: 'aguardando_geracao' }), /Gerando PIX/);
  assert.match(card(a, { ...p, pixStatus: 'pago' }), /PIX Confirmado/);
});

test('1b: Pix online pendente trocado para "Pix na entrega" — a troca limpa o Pix e o timer antigo não cancela o pedido', async () => {
  const a = painel();
  const rel = relogioPix(a);
  a.rodar('iniciarListenersFirestore()');
  const lis = a.fs.listeners.find((l) => l.path === 'clientes/teste/pedidos');
  const P = { ...base(), id: '104', pagamento: 'pix', pixStatus: 'pendente', pixId: 'mp-104', pixExpira: Date.now() + 60000, status: 'novo' };
  lis.cb(snapshot([P]));
  await esperar();
  const els = rel.montar(card(a, a.rodar("pedidos.find(x => x.id === '104')")));
  assert.equal(els.length, 1, 'antes da troca o card tem o cronômetro do Pix');
  // operador troca para "📱 Pix na entrega"
  a.rodar("_aplicarTrocaPagamento('104', 'pix')");
  await esperar();
  const up = a.fs.escritas.find((e) => e.op === 'update' && e.path === 'clientes/teste/pedidos/104');
  assert.ok(up, 'gravou a troca');
  assert.equal(up.data.pagamento, 'pix');
  assert.equal(up.data.pagamentoManual, true);
  assert.equal(up.data.pixStatus && up.data.pixStatus._sentinela, 'delete', 'limpa o pixStatus do Pix online');
  assert.equal(up.data.pixExpira && up.data.pixExpira._sentinela, 'delete', 'limpa a validade do Pix online');
  assert.equal(up.data.pixId, undefined, 'o pixId fica (o webhook ainda acha o pedido se o cliente pagar o QR antigo)');
  assert.equal(els[0].dataset.pixExpira, undefined, 'o cronômetro do card parou na hora');
  // o snapshot traz o doc gravado; o QR antigo está para vencer (se ainda estiver gravado); o relógio roda 6 min
  const depois = aplicar(P, up.data);
  if ('pixExpira' in depois) depois.pixExpira = Date.now() + 30;
  lis.cb(snapshot([depois]));
  await esperar();
  const c = card(a, a.rodar("pedidos.find(x => x.id === '104')"));
  rel.montar(c);
  await dormir(60);
  for (let s = 0; s < 360; s++) rel.tick();
  await esperar();
  a.rodar("cancelarPedidoPix('104')");
  await esperar();
  assert.equal(cancelamentos(a, '104').length, 0, 'o pedido NÃO foi cancelado');
  assert.doesNotMatch(c, /Gerando PIX|PIX Pendente|PIX Expirado/);
  assert.match(c, /Confirmar → Produção/);
});

test('1c: pedido trocado ANTES da correção (pixStatus pendente gravado) não é cancelado pelo timer', async () => {
  const a = painel();
  const rel = relogioPix(a);
  a.rodar('iniciarListenersFirestore()');
  const lis = a.fs.listeners.find((l) => l.path === 'clientes/teste/pedidos');
  const P = { ...base(), id: '106', pagamento: 'pix', pagamentoManual: true, formaPagamentoAnterior: 'pix', pixStatus: 'pendente', pixExpira: Date.now() - 5000, status: 'producao' };
  lis.cb(snapshot([P]));
  await esperar();
  const c = card(a, a.rodar("pedidos.find(x => x.id === '106')"));
  assert.doesNotMatch(c, /data-pix-expira|PIX Pendente|PIX Expirado|Gerando PIX/);
  // mesmo com um elemento velho do cronômetro ainda na tela, o relógio não cancela
  rel.montar(`<div data-pix-expira="${Date.now() - 5000}" data-pix-pid="106"></div>`);
  rel.tick();
  await esperar();
  assert.equal(cancelamentos(a, '106').length, 0);
  // controle: Pix online de verdade vencido continua cancelando sozinho
  lis.cb(snapshot([P, { ...base(), id: '107', pagamento: 'pix', pixStatus: 'pendente', pixExpira: Date.now() - 5000, status: 'novo' }]));
  await esperar();
  rel.montar(`<div data-pix-expira="${Date.now() - 5000}" data-pix-pid="107"></div>`);
  rel.tick();
  await esperar();
  assert.equal(cancelamentos(a, '107').length, 1, 'Pix online vencido segue cancelando');
});

test('1d: troca nos outros sentidos (Pix → dinheiro/cartão, dinheiro → Pix, Pix pago, agendado não pago)', async () => {
  for (const nova of ['dinheiro', 'credito', 'debito']) {
    const a = painel();
    const rel = relogioPix(a);
    a.rodar('iniciarListenersFirestore()');
    const lis = a.fs.listeners.find((l) => l.path === 'clientes/teste/pedidos');
    const P = { ...base(), id: '110', pagamento: 'pix', pixStatus: 'pendente', pixExpira: Date.now() + 60000, status: 'novo' };
    lis.cb(snapshot([P]));
    await esperar();
    rel.montar(card(a, a.rodar("pedidos[0]")));
    a.rodar(`_aplicarTrocaPagamento('110', '${nova}')`);
    await esperar();
    const up = a.fs.escritas.find((e) => e.op === 'update' && e.path === 'clientes/teste/pedidos/110');
    assert.equal(up.data.pagamento, nova);
    assert.equal(up.data.pixStatus && up.data.pixStatus._sentinela, 'delete', nova);
    const depois = aplicar(P, up.data);
    if ('pixExpira' in depois) depois.pixExpira = Date.now() + 30;
    lis.cb(snapshot([depois]));
    await esperar();
    rel.montar(card(a, a.rodar('pedidos[0]')));
    await dormir(60);
    rel.tick();
    a.rodar("cancelarPedidoPix('110')");
    await esperar();
    assert.equal(cancelamentos(a, '110').length, 0, nova);
  }
  // dinheiro → Pix na entrega: nada de Pix online para limpar, sem tarja
  {
    const a = painel();
    a.rodar('iniciarListenersFirestore()');
    const lis = a.fs.listeners.find((l) => l.path === 'clientes/teste/pedidos');
    const P = { ...base(), id: '111', pagamento: 'dinheiro', troco: 100, status: 'novo' };
    lis.cb(snapshot([P]));
    await esperar();
    a.rodar("_aplicarTrocaPagamento('111', 'pix')");
    await esperar();
    const up = a.fs.escritas.find((e) => e.op === 'update' && e.path === 'clientes/teste/pedidos/111');
    assert.deepEqual(Object.keys(up.data).sort(), ['formaPagamentoAnterior', 'pagamento', 'pagamentoManual']);
    const c = card(a, aplicar(P, up.data));
    assert.doesNotMatch(c, /Gerando PIX/);
    assert.match(c, /PIX \(na entrega\)/);
  }
  // Pix PAGO trocado (raro): o pago fica registrado
  {
    const a = painel();
    a.rodar('iniciarListenersFirestore()');
    const lis = a.fs.listeners.find((l) => l.path === 'clientes/teste/pedidos');
    lis.cb(snapshot([{ ...base(), id: '112', pagamento: 'pix', pixStatus: 'pago', status: 'novo' }]));
    await esperar();
    a.rodar("_aplicarTrocaPagamento('112', 'dinheiro')");
    await esperar();
    const up = a.fs.escritas.find((e) => e.op === 'update' && e.path === 'clientes/teste/pedidos/112');
    assert.equal('pixStatus' in up.data, false, 'não apaga Pix pago');
  }
  // agendado do WhatsApp marcado "não pago" pela function: o aviso sai com a troca
  {
    const a = painel();
    a.rodar('iniciarListenersFirestore()');
    const lis = a.fs.listeners.find((l) => l.path === 'clientes/teste/pedidos');
    const P = { ...base(), id: '113', origem: 'whatsapp', agendado: true, dataHoraAgendada: '21/10 20:00', agendadoNaoPago: true, pagamento: 'pix', pixStatus: 'pendente', pixExpira: Date.now() + 60000, status: 'novo' };
    lis.cb(snapshot([P]));
    await esperar();
    assert.match(card(a, P), /Agendado não pago/);
    a.rodar("_aplicarTrocaPagamento('113', 'dinheiro')");
    await esperar();
    const up = a.fs.escritas.find((e) => e.op === 'update' && e.path === 'clientes/teste/pedidos/113');
    assert.equal(up.data.agendadoNaoPago && up.data.agendadoNaoPago._sentinela, 'delete');
    assert.doesNotMatch(card(a, aplicar(P, up.data)), /Agendado não pago/);
  }
});

// ── 2. Aviso de WhatsApp ao motoboy: a mesma regra do app do motoboy ──────────────────────────────────────────────
// Categoria do que o motoboy faz na porta, a partir do texto (aviso) ou do card (app).
function categoria(txt) {
  if (/Pago no app|Pago no iFood|Pago na 99/.test(txt)) return 'nao-cobrar';
  if (/Pix na entrega · receber/.test(txt)) return 'pix-receber';
  if (/Pix · pago/.test(txt)) return 'pix-pago';
  if (/Cartão na entrega/.test(txt)) return 'cartao';
  if (/Dinheiro/.test(txt)) return 'dinheiro';
  return '?';
}
async function aviso(p, slug = 'teste') {
  const a = painel(slug);
  a.fs.docs[`clientes/${slug}/motoboys/m1`] = { nome: 'João Silva', telefone: '21988887777', slug: 'joao-x1' };
  const env = [];
  a.ctx.__env = env;
  a.rodar('enviarWhatsAppBot = (tel, msg, tpl, reg) => { __env.push({ tel, msg, tpl, reg }); }');
  a.ctx.__p = { ...base(), id: '120', status: 'entregue', entregadorId: 'm1', entregadorNome: 'João Silva', ...p };
  await a.rodar('notificarMotoboyEntrega(__p)');
  assert.equal(env.length, 1, 'mandou um aviso');
  return { linha: env[0].msg.split('\n')[3], tpl: env[0].tpl && env[0].tpl.params[4], msg: env[0].msg };
}
function noApp(p) {
  const e = carregar('entregador.html', { busca: '' });
  e.ctx.__l = [{ ...base(), id: '120', status: 'entregue', ...p }];
  e.rodar('render(__l)');
  const m = e.elementos.conteudo.innerHTML.match(/<div class="pag"><span class="[^"]+">([^<]*)<\/span>/);
  return m ? m[1] : '';
}

test('2: o aviso de WhatsApp ao motoboy diz a forma de pagamento certa em cada caso (a mesma regra do app)', async () => {
  const casos = [
    [{ pagamento: 'pix', pixStatus: 'pago' }, '📱 Pix · pago', 'Pix (já pago)'],
    [{ pagamento: 'pix', pagamentoManual: true, formaPagamentoAnterior: 'dinheiro' }, '📱 Pix na entrega · receber R$ 57,00', 'Pix na entrega, receber 57,00'],
    [{ pagamento: 'pix', pagamentoManual: true, formaPagamentoAnterior: 'pix', pixStatus: 'pendente' }, '📱 Pix na entrega · receber R$ 57,00', 'Pix na entrega, receber 57,00'],
    [{ pagamento: 'pix', origem: 'ifood', ifoodOrderId: 'o-1', ifoodTipo: 'DELIVERY', ifoodEntregaPor: 'MERCHANT', cliente: { ...cli, tel: '' } }, '📱 Pix na entrega · receber R$ 57,00', 'Pix na entrega, receber 57,00'],
    [{ pagamento: 'pix', pagamentoManual: true, pixStatus: 'pago' }, '📱 Pix · pago', 'Pix (já pago)'],   // pagou o QR antigo depois da troca
    [{ pagamento: 'dinheiro', troco: 100 }, '💵 Dinheiro · receber R$ 57,00 · troco p/ R$ 100,00 (levar R$ 43,00)', 'Dinheiro, receber 57,00, troco para 100,00 (levar 43,00)'],
    [{ pagamento: 'dinheiro', troco: 0 }, '💵 Dinheiro · receber R$ 57,00', 'Dinheiro, receber 57,00'],
    [{ pagamento: 'credito' }, '💳 Cartão na entrega · receber R$ 57,00 · levar maquininha', 'Cartão na entrega, receber 57,00, levar maquininha'],
    [{ pagamento: 'debito' }, '💳 Cartão na entrega · receber R$ 57,00 · levar maquininha', 'Cartão na entrega, receber 57,00, levar maquininha'],
    [{ pagamento: 'cartao' }, '💳 Cartão na entrega · receber R$ 57,00 · levar maquininha', 'Cartão na entrega, receber 57,00, levar maquininha'],
    [{ pagamento: 'ifood', origem: 'ifood', ifoodOrderId: 'o-2', ifoodTipo: 'DELIVERY', ifoodEntregaPor: 'MERCHANT', cliente: { ...cli, tel: '' } }, '📱 Pago no app · não cobrar', 'Pago no app, não cobrar'],
  ];
  for (const [p, txt, tpl] of casos) {
    const r = await aviso(p, 'joey');
    assert.equal(r.linha, txt, JSON.stringify(p));
    assert.equal(r.tpl, tpl, 'template: ' + JSON.stringify(p));
    assert.equal(categoria(r.linha), categoria(noApp(p)), 'aviso e app concordam: ' + JSON.stringify(p) + ' app=' + noApp(p));
  }
  // fora da Joey vai só o texto (sem template), com a mesma linha
  const outro = await aviso({ pagamento: 'credito' });
  assert.equal(outro.linha, '💳 Cartão na entrega · receber R$ 57,00 · levar maquininha');
});

// ── 3. App do motoboy: id e endereço com aspas não quebram os botões ──────────────────────────────────────────────
// "Clica" em cada handler do HTML: o atributo é desfeito como o navegador faz e o código roda com this.dataset.
function handlers(html) {
  const out = [];
  for (const m of String(html).matchAll(/<(\w+)((?:\s+[\w-]+(?:="[^"]*")?)*)\s*\/?>/g)) {
    const attrs = {};
    for (const a of m[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g)) attrs[a[1]] = a[2] == null ? '' : desfaz(a[2]);
    const dataset = {};
    for (const [k, v] of Object.entries(attrs)) if (k.startsWith('data-')) dataset[k.slice(5).replace(/-(\w)/g, (_, c) => c.toUpperCase())] = v;
    for (const [k, v] of Object.entries(attrs)) if (/^on/.test(k)) out.push({ tag: m[1], ev: k, code: v, dataset });
  }
  return out;
}
function clicar(h) {
  const chamadas = [];
  const ctx = {
    __this: { dataset: h.dataset, value: '1234', isConnected: true }, __ev: { key: 'Enter', preventDefault() {} },
    abrirRotaMenu: (d, c) => chamadas.push(['rota', d, c]), entreguei: (id) => chamadas.push(['entreguei', id]),
    validarCodigo: (id) => chamadas.push(['validar', id]), _cod: { valor: {}, foco: null }, alert: () => chamadas.push(['ALERT']),
  };
  vm.runInNewContext(`(function (event) { ${h.code} }).call(__this, __ev)`, ctx);
  return { chamadas, cod: ctx._cod };
}

test("3: app do motoboy — esc() escapa ' e \"; id e endereço com aspas chegam inteiros nos botões", () => {
  const e = carregar('entregador.html', { busca: '' });
  assert.equal(e.rodar(`esc("D'Ávila \\"x\\" <b>&")`), 'D&#39;Ávila &quot;x&quot; &lt;b&gt;&amp;');
  const id = "1');alert(3);('";
  const cliente = { nome: "Ana D'Ávila", rua: "Rua D'Ávila", numero: '10', bairro: "Sant'Ana", tel: '' };
  const normal = { id, status: 'entregue', cliente, itens: [{ qty: 1, nome: 'X' }], total: 30, pagamento: 'dinheiro', entrega: 'delivery' };
  const ifood = { ...normal, id: id + 'i', origem: 'ifood', ifoodOrderId: 'o', ifoodTipo: 'DELIVERY', ifoodEntregaPor: 'MERCHANT', pagamento: 'ifood' };
  e.ctx.__l = [normal, ifood];
  e.rodar('render(__l)');
  const html = e.elementos.conteudo.innerHTML;
  const hs = handlers(html);
  assert.ok(hs.length >= 6, 'achou os handlers');
  const vistos = { rota: 0, entreguei: 0, validar: 0, digitado: 0 };
  for (const h of hs) {
    assert.doesNotMatch(h.code, /alert\(3\)/, 'id cru no handler: ' + h.code);
    const { chamadas, cod } = clicar(h);
    assert.ok(!chamadas.some((c) => c[0] === 'ALERT'));
    for (const c of chamadas) {
      if (c[0] === 'rota') { vistos.rota++; assert.equal(decodeURIComponent(c[1]), "Rua D'Ávila, 10, Sant'Ana"); assert.equal(c[2], false); }
      if (c[0] === 'entreguei') { vistos.entreguei++; assert.equal(c[1], id); }
      if (c[0] === 'validar') { vistos.validar++; assert.equal(c[1], id + 'i'); }
    }
    if (h.ev === 'oninput') { vistos.digitado++; assert.equal(cod.valor[id + 'i'], '1234'); }
  }
  assert.deepEqual(vistos, { rota: 2, entreguei: 1, validar: 2, digitado: 1 });
  assert.doesNotMatch(html, /<b>|Ana D'Ávila/, 'texto escapado');
  assert.match(html, /Ana D&#39;Ávila/);
  // rota por coordenada continua com coord = true
  e.ctx.__l = [{ ...normal, id: '9', gpsLat: -5.1, gpsLng: -42.8 }];
  e.rodar('render(__l)');
  const rota = handlers(e.elementos.conteudo.innerHTML).find((h) => /abrirRotaMenu/.test(h.code));
  assert.deepEqual(clicar(rota).chamadas[0], ['rota', encodeURIComponent('-5.1,-42.8'), true]);
});

// ── 4. Texto do cliente na comanda, busca, histórico e NFC-e ─────────────────────────────────────────────────────
const mau = (p) => ({
  ...p,
  hora: '19:00<b>h</b>', data: hoje(),
  cliente: { ...p.cliente, nome: 'Conceição 🍔 & Cia <img src=x onerror=alert(1)>', tel: '<i>21</i>', rua: '<b>Rua</b>', numero: '1<i>', bairro: '<u>Centro</u>', comp: '<s>apto</s>', ref: '<script>x()</script>' },
  obs: 'tocar <em>2x</em>', mesaNome: 'Mesa <u>4</u>',
  itens: [{ qty: 1, nome: 'X-Tudo <svg onload=alert(2)>', preco: 10, obs: 'sem <em>cebola</em> & muito bem passado, por favor 😋', adicionais: [{ nome: '<marquee>Bacon', grupo: '<h1>Extras', preco: 2, qty: 1 }] }],
});
const TAGS = ['<img', '<b>', '<i>', '<u>', '<s>', '<script', '<svg', '<em>', '<marquee', '<h1'];
const semTag = (onde, html) => { for (const t of TAGS) assert.ok(!String(html).includes(t), `${onde}: ${t} cru`); };

test('4a: comandas (entrega, produção, mesa) escapam o texto do cliente sem mudar a largura da caixa de OBS', () => {
  const a = painel();
  a.rodar("config = { nome: 'Joey', tempo_delivery: '40-50' }");
  for (const tipo of ['delivery', 'retirada', 'local']) {
    a.ctx.__p = mau({ ...base(), id: '130', pagamento: 'dinheiro', troco: 100, status: 'producao', entrega: tipo });
    for (const f of ['gerarHtmlComanda(__p)', 'gerarHtmlPedidoProducao(__p)', "gerarHtmlComandaMesa(__p, __p.mesaNome)"]) {
      const h = a.rodar(f);
      semTag(`${tipo} ${f}`, h);
      assert.match(desfaz(h), /Conceição 🍔 & Cia <img src=x onerror=alert\(1\)>|X-Tudo <svg onload=alert\(2\)>/, f);
    }
  }
  // OBS do item: as linhas da caixa continuam com 28 caracteres NO PAPEL (o & conta 1, não 5)
  a.ctx.__p = mau({ ...base(), id: '131', pagamento: 'pix', pixStatus: 'pago', status: 'producao' });
  const caixa = a.rodar('gerarHtmlComanda(__p)').match(/<pre class="obs-box">([\s\S]*?)<\/pre>/)[1].split('\n');
  assert.ok(caixa.length >= 3);
  for (const l of caixa) assert.equal(desfaz(l).length, 28, JSON.stringify(desfaz(l)));   // .length: a mesma conta do obsBox
});

test('4b: busca, histórico e NFC-e escapam o texto e não põem id cru em onclick', () => {
  const a = painel();
  const id = "140');alert(3);('";
  const p = mau({ ...base(), id, pagamento: 'dinheiro', status: 'entregue' });
  a.ctx.__p = p;
  a.rodar('pedidos = [__p]; notasFiscais = []');
  const telas = {};
  a.rodar("buscaTermo = 'Conceição'; renderBusca()");
  telas.busca = a.elementos['busca-results'].innerHTML;
  a.rodar('renderHistorico()');
  telas.historico = a.elementos.historicoContent.innerHTML;
  a.rodar('renderRelatorioNotas()');
  telas.nfTabela = a.elementos.nfTabela.innerHTML;
  a.rodar(`notasFiscais = [{ pedidoId: __p.id, status: 'emitida', numeroNota: '77', focusRef: "ref'1", total: 57 }]; renderRelatorioNotas()`);
  telas.nfTabelaEmitida = a.elementos.nfTabela.innerHTML;
  a.rodar("notasFiscais = []; openNfceModal(__p.id)");
  telas.nfceModal = a.elementos.nfceModalBody.innerHTML;
  for (const [onde, html] of Object.entries(telas)) {
    assert.ok(html && html.length > 50, onde + ' renderizou');
    semTag(onde, html);
    const hs = [...html.matchAll(/\bon[a-z]+="([^"]*)"/g)].map((m) => m[1]);
    assert.ok(hs.length > 0, onde + ' tem handler');
    for (const h of hs) assert.ok(!desfaz(h).includes('alert(3)'), `${onde}: id cru num handler: ${h}`);
  }
  assert.match(telas.busca, /Conceição 🍔 &amp; Cia &lt;img/);
  assert.match(telas.historico, /Conceição 🍔 &amp; Cia &lt;img/);
  assert.match(telas.nfceModal, /Conceição 🍔 &amp; Cia &lt;img/);
});

// ── 5. total/troco gravado como texto não derruba o kanban (e o dado gravado não muda) ────────────────────────────
test('5: pedido com total/troco em texto aparece no kanban, no modal e na comanda — sem gravar nada', async () => {
  const a = painel();
  a.rodar("config = { nome: 'Joey', tempo_delivery: '40-50' }");
  a.rodar('iniciarListenersFirestore()');
  const lis = a.fs.listeners.find((l) => l.path === 'clientes/teste/pedidos');
  const P = { ...base(), id: '150', status: 'novo', pagamento: 'dinheiro', total: '57', troco: '100,00', subtotal: '52', taxaEntrega: '5', desconto: { tipo: 'valor', valor: 3, valorAplicado: '3' } };
  const Q = { ...base(), id: '151', status: 'producao', pagamento: 'credito', total: 'R$ 1.234,50', troco: 'abc' };
  assert.doesNotThrow(() => lis.cb(snapshot([P, Q])));
  await esperar();
  const quadro = a.elementos.kanbanBoard.innerHTML;
  assert.match(quadro, /R\$ 57,00/);
  assert.match(quadro, /R\$ 1234,50/);
  a.rodar("openOrderModal('150')");
  assert.match(a.elementos.modalBody.innerHTML, /troco p\/ R\$ 100,00/);
  const com = a.rodar("gerarHtmlComanda(pedidos.find(x => x.id === '150'))");
  assert.match(com, /TROCO PARA: R\$ 100,00/);
  assert.match(com, /LEVAR TROCO: R\$ 43,00/);
  a.rodar("buscaTermo = 'Ana'; renderBusca(); renderHistorico()");
  assert.match(a.elementos.historicoContent.innerHTML, /R\$ 57,00/);
  const gravou = a.fs.escritas.filter((e) => /\/pedidos\/15[01]$/.test(e.path) && e.data && ['total', 'troco', 'subtotal', 'taxaEntrega'].some((k) => k in e.data));
  assert.equal(gravou.length, 0, 'não regrava o valor do pedido');
  // número continua número (nada muda para os pedidos normais)
  a.ctx.__n = { ...base(), total: 57, troco: 0, desconto: { valorAplicado: 2 } };
  assert.equal(a.rodar('JSON.stringify(_pedidoLido({ ...__n }))'), JSON.stringify(a.ctx.__n));
});
