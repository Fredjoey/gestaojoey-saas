// 99Food — o que o Roteiro de Integração oficial da 99 pede no painel, na comanda e no app do motoboy (22/10/2026):
// valor dos itens, entrega, desconto da LOJA × desconto da 99, já pago, falta pagar, nome, endereço e order_index;
// entrega da 99 sempre paga para a loja; localizador só na entrega própria; retirada com endereço vazio não quebra.
// Os pedidos abaixo têm o formato que o joey-ifood (src/99food/pedidoRegras.js montarPedido) grava.
const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar } = require('./sandbox');

const hoje = () => new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
const itens = [{ qty: 1, nome: 'X-Burger', preco: 62 }];
const base = (extra) => ({
  id: '701', data: hoje(), hora: '19:00', ts: Date.now(), status: 'novo', itens, origem: '99food',
  food99OrderId: '5764612234567890123', food99OrderIndex: 37, ...extra,
});

// O exemplo do roteiro: itens 62, entrega 7, promoções 9 (loja) + 57 (99), real_price 60, o cliente paga 3 em dinheiro.
const precosRoteiro = { itens: 62, entrega: 7, descontoLoja: 9, descontoPlataforma: 57, descontoTotal: 66, total: 3, jaPago: 0, faltaPagar: 3, lojaRecebe: 60 };
const promocoes = [{ tipo: 1, total: 9, loja: 9, plataforma: 0, nome: 'Cupom da loja' }, { tipo: 2, total: 57, loja: 0, plataforma: 57, nome: 'Cupom 99' }];
const endereco = { nome: 'Ana', tel: '', rua: 'Rua Augusta', numero: '1500', bairro: 'Consolação', comp: 'ap 12', cidade: 'São Paulo', uf: 'SP' };

const propriaDinheiro = () => base({
  entrega: 'delivery', cliente: endereco, subtotal: 62, taxaEntrega: 7, total: 3, pagamento: 'dinheiro', troco: 50,
  desconto: { tipo: 'valor', valor: 66, valorAplicado: 66, origem: '99food' },
  food99TipoEntrega: 2, food99FulfillmentMode: 0, food99Retirada: false, food99Teste: true,
  food99Pagamento: { online: false, metodo: 2, canal: 153, canalNome: 'Dinheiro', pagoNa99: false, trocoPara: 50 },
  food99Precos: precosRoteiro, food99Promocoes: promocoes,
  food99Localizador: { localizador: '13547486', telefone: '+55 11 4000-1234', link: 'https://food-b-h5.99app.com/pt-BR/v2/confirmation-entrega' },
});
const pela99Dinheiro = () => base({
  id: '702', entrega: 'delivery', cliente: endereco, subtotal: 62, taxaEntrega: 7, total: 3, pagamento: '99food', troco: 0,
  desconto: { tipo: 'valor', valor: 66, valorAplicado: 66, origem: '99food' },
  food99TipoEntrega: 1, food99Retirada: false, food99CodigoEntregador: '4821',
  food99Pagamento: { online: false, metodo: 2, canal: 153, canalNome: 'Dinheiro', pagoNa99: true, entregador99Cobra: 3 },
  food99Precos: { ...precosRoteiro, jaPago: 3, faltaPagar: 0, lojaRecebe: 53 }, food99Promocoes: promocoes,
});
const retiradaVazia = (cliente) => base({
  id: '703', entrega: 'retirada', cliente, subtotal: 62, taxaEntrega: 0, total: 62, pagamento: '99food',
  food99TipoEntrega: 1, food99FulfillmentMode: 1, food99Retirada: true, food99CodigoRetirada: '7788',
  food99Pagamento: { online: true, metodo: 1, canal: 150, canalNome: 'Cartão de crédito', pagoNa99: true },
  food99Precos: { itens: 62, entrega: 0, descontoLoja: 0, descontoPlataforma: 0, descontoTotal: 0, total: 62, jaPago: 62, faltaPagar: 0, lojaRecebe: 62 },
});

function painel() {
  const a = carregar('painel.html');
  a.rodar("slug = 'teste'; config = { nome: 'Joey' }");
  return a;
}
const card = (a, p) => { a.ctx.__p = p; return a.rodar('orderCardHtml(__p)'); };
const modal = (a, p) => { a.ctx.__p = p; a.rodar('pedidos = [__p]; openOrderModal(__p.id)'); return a.elementos.modalBody.innerHTML; };
const comanda = (a, p) => { a.ctx.__p = p; return a.rodar('gerarHtmlComanda99(__p)'); };
const texto = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');

test('roteiro: entrega PRÓPRIA em dinheiro — card, modal e comanda com itens, entrega, desconto loja × 99, já pago e falta pagar', () => {
  const a = painel();
  const p = propriaDinheiro();
  const c = card(a, p);
  assert.match(c, /99Food#37 · entrega própria · 🧪 teste/);
  assert.match(c, /💰 Cobrar R\$ 3,00 · Dinheiro · troco p\/ R\$ 50,00 \(levar R\$ 47,00\)/);
  assert.match(c, /🎟️ Desconto: loja R\$ 9,00 · 99 R\$ 57,00/);
  assert.match(c, /localizador <b>13547486<\/b>/);
  assert.doesNotMatch(c, /dinheiro-recebido|food99DinheiroRecebido/);
  const m = texto(modal(a, p));
  for (const re of [/Valor dos itens R\$ 62,00/, /Entrega R\$ 7,00/, /Desconto da loja - R\$ 9,00/, /Desconto da 99 - R\$ 57,00/,
    /Total do pedido R\$ 3,00/, /Já pago R\$ 0,00/, /Falta pagar R\$ 3,00/, /A loja recebe \(99\) R\$ 60,00/, /Cupom 99 R\$ 57,00 \(loja R\$ 0,00 · 99 R\$ 57,00\)/,
    /Telefone \(99\) \+55 11 4000-1234 · localizador 13547486/]) assert.match(m, re);
  assert.match(modal(a, p), /href="https:\/\/food-b-h5\.99app\.com\/pt-BR\/v2\/confirmation-entrega"/);
  const t = texto(comanda(a, p));
  for (const re of [/99FOOD · TESTE/, /99 #37/, /Nº 701/, /ENTREGA PRÓPRIA/, /Cliente: Ana/, /Endereço: Rua Augusta, 1500/, /Bairro: Consolação/,
    /Valor total dos itens R\$ 62,00/, /Taxa de entrega R\$ 7,00/, /Desconto da loja - R\$ 9,00/, /Desconto da 99 - R\$ 57,00/,
    /VALOR TOTAL R\$ 3,00/, /Já pago R\$ 0,00/, /FALTA PAGAR R\$ 3,00/, /Cobrar do cliente na entrega/, /TROCO PARA: R\$ 50,00/, /LEVAR TROCO: R\$ 47,00/,
    /LOCALIZADOR 13547486/]) assert.match(t, re);
  assert.match(comanda(a, p), /<div class="ped-num">99 #37<\/div>/, 'o order_index é o número grande');
});

test('roteiro: entrega PELA 99 é sempre paga para a loja — mesmo com o cliente pagando em dinheiro ao entregador da 99', () => {
  const a = painel();
  const p = pela99Dinheiro();
  const c = card(a, p);
  assert.match(c, /✅ Pago na 99 · Dinheiro — com o entregador da 99 · a loja não cobra \(o entregador da 99 cobra R\$ 3,00\)/);
  assert.doesNotMatch(c, /💰 Cobrar/);
  assert.doesNotMatch(c, /localizador/, 'localizador só na entrega própria');
  assert.match(c, /Código do entregador da 99: <b>4821<\/b>/);
  const m = texto(modal(a, p));
  assert.match(m, /Falta pagar R\$ 0,00/);
  assert.match(m, /Já pago R\$ 3,00/);
  assert.match(m, /A loja recebe \(99\) R\$ 53,00/);
  assert.doesNotMatch(m, /Telefone \(99\)/);
  const t = texto(comanda(a, p));
  assert.match(t, /\* Pago na 99 — não cobrar \*/);
  assert.match(t, /FALTA PAGAR R\$ 0,00/);
  assert.match(t, /ENTREGA PELA 99/);
  assert.match(t, /Entregue por: ENTREGADOR 99/);
  assert.match(t, /Endereço: Rua Augusta, 1500/, 'a comanda mostra o endereço também na entrega da 99');
  assert.doesNotMatch(t, /LOCALIZADOR|Cobrar do cliente/);
  // aviso de WhatsApp ao motoboy (se alguém atribuir): pago no app
  a.ctx.__p = p;
  assert.match(a.rodar('_pagamentoMotoboy(__p).txt'), /Pago no app · não cobrar/);
});

test('roteiro: RETIRADA com endereço vazio, ausente ou nulo não quebra card, modal nem comanda (código de retirada aparece)', () => {
  for (const cliente of [{ nome: 'Bia' }, { nome: 'Bia', tel: '', rua: '', numero: '', bairro: '' }, undefined, null]) {
    const a = painel();
    const p = retiradaVazia(cliente);
    let c, m, k;
    assert.doesNotThrow(() => { c = card(a, p); m = modal(a, p); k = comanda(a, p); }, JSON.stringify(cliente));
    assert.match(c, /99Food#37 · retirada/);
    assert.match(c, /Código de retirada: <b>7788<\/b>/);
    assert.match(c, /✅ Pago na 99 · Cartão de crédito/);
    assert.doesNotMatch(c, /undefined|null/);
    assert.doesNotMatch(texto(m), /Entrega R\$/, 'retirada não mostra linha de entrega');
    const t = texto(k);
    assert.match(t, /PARA RETIRAR/);
    assert.match(t, /Código de retirada: 7788/);
    assert.match(t, /VALOR TOTAL R\$ 62,00/);
    assert.match(t, /FALTA PAGAR R\$ 0,00/);
    assert.doesNotMatch(t, /ENTREGA PEDIDO|Endereço:|Taxa de entrega|undefined/);
  }
});

test('roteiro: app do motoboy — localizador da 99 (telefone virtual + localizador + página de entrega) e o valor a receber = falta pagar', () => {
  const p = { ...propriaDinheiro(), status: 'entregue', entregadorId: 'm1', total: 35, food99Precos: { ...precosRoteiro, total: 35, faltaPagar: 20 } };
  const e = carregar('entregador.html', { busca: '' });
  e.ctx.__l = [p];
  e.rodar('render(__l)');
  const html = e.elementos.conteudo.innerHTML;
  assert.match(html, /<div class="tag99">99Food #37<\/div>/);
  assert.match(html, /<a href="tel:\+551140001234">\+55 11 4000-1234<\/a>/);
  assert.match(html, /Informe o localizador <b>13547486<\/b>/);
  assert.match(html, /Página de entrega da 99/);
  assert.match(html, /<span class="total">R\$ 20,00<\/span>/, 'cobrar o falta pagar, não o total');
  assert.match(html, /Código de entrega/, 'entrega própria segue pedindo o código do cliente');
  // o aviso de WhatsApp do painel diz o mesmo valor
  const a = painel();
  a.ctx.__p = p;
  assert.match(a.rodar('_pagamentoMotoboy(__p).txt'), /💵 Dinheiro · receber R\$ 20,00 · troco p\/ R\$ 50,00 \(levar R\$ 30,00\)/);
  // entrega da 99 (se aparecer) e endereço vazio: sem localizador, sem erro
  const e2 = carregar('entregador.html', { busca: '' });
  e2.ctx.__l = [{ ...pela99Dinheiro(), status: 'entregue', cliente: {} }];
  assert.doesNotThrow(() => e2.rodar('render(__l)'));
  assert.doesNotMatch(e2.elementos.conteudo.innerHTML, /loc99|localizador/);
});

test('roteiro: "Loja na 99" mostra o método de confirmação (B-App & OpenAPI no piloto)', () => {
  const a = painel();
  const h = a.rodar("_f99MetodoHtml({ modo: 'bapp', nome: 'B-App & OpenAPI', codigo: 1, aplicadoEm: '2026-10-22T15:00:00.000Z', erro: null })");
  assert.match(h, /Confirmação dos pedidos: <b>B-App &amp; OpenAPI<\/b>/);
  assert.match(h, /99Store aberto/);
  const h2 = a.rodar("_f99MetodoHtml({ modo: 'api', nome: 'só OpenAPI', erro: 'a 99 recusou: x' })");
  assert.match(h2, /só OpenAPI/);
  assert.match(h2, /não aplicado na 99: a 99 recusou: x/);
  assert.doesNotMatch(h2, /99Store/);
  assert.equal(a.rodar('_f99MetodoHtml(null)'), '');
});

test('roteiro: fluxos sem pular etapa — o painel pede à 99 confirmar → pronto → (entregue/despachar) na ordem', () => {
  const a = painel();
  const acao = (p) => { a.ctx.__p = p; return a.rodar('_99AcaoAvanco(__p)'); };
  const prop = propriaDinheiro(), ret = retiradaVazia({ nome: 'Bia' }), p99 = pela99Dinheiro();
  for (const p of [prop, ret, p99]) {
    assert.equal(acao({ ...p, status: 'novo' }), 'confirmar');
    assert.equal(acao({ ...p, status: 'producao' }), 'pronto');
  }
  assert.equal(acao({ ...ret, status: 'pronto' }), 'entregue', 'retirada: pronto → finish');
  assert.equal(acao({ ...prop, status: 'pronto' }), 'despachar', 'entrega própria: saiu (o serviço só registra)');
  assert.equal(acao({ ...p99, status: 'pronto' }), 'despachar', 'entrega da 99: o entregador da 99 retirou (sem chamada)');
  a.ctx.__p = { ...prop, status: 'entregue' };
  assert.equal(a.rodar('_99PrecisaEntregue(__p)'), true, 'entrega própria que saiu: o Finalizar avisa delivered');
  a.ctx.__p = { ...p99, status: 'entregue' };
  assert.equal(a.rodar('_99PrecisaEntregue(__p)'), false, 'entrega da 99: a 99 conclui');
});
