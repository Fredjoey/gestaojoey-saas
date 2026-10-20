// 99Food: entrega própria concluída pelo CÓDIGO de entrega cria a nota pendente — a mesma correção do bug 2 do iFood
// (20/10/2026). O joey-ifood grava finalizado + entregueEm + food99CodigoEntregaValidado { em, por, papel }.
const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar, snapshot, esperar } = require('./sandbox');

const hoje = () => new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
const pedido99 = (extra) => ({
  data: hoje(), hora: '19:00', ts: Date.now(), itens: [{ qty: 1, nome: 'X-Burger', preco: 30 }], subtotal: 30, taxaEntrega: 5, total: 35,
  cliente: { nome: 'Ana', tel: '', rua: 'Rua A', numero: '10', bairro: 'Centro' }, entrega: 'delivery', pagamento: '99food',
  origem: '99food', food99OrderId: '5764612234567890123', food99TipoEntrega: 2, ...extra,
});
function painel() {
  const a = carregar('painel.html');
  a.rodar("slug = 'teste'");
  a.rodar('iniciarListenersFirestore()');
  return { a, lis: a.fs.listeners.find((l) => l.path === 'clientes/teste/pedidos') };
}
const notas = (a, id) => a.fs.escritas.filter((e) => e.path === `clientes/teste/notasFiscais/${id}`);

test('99: entrega própria concluída pelo código de entrega cria a nota pendente (uma vez só)', async () => {
  const { a, lis } = painel();
  const pronto = pedido99({ id: '401', status: 'pronto', prontoEm: Date.now() - 60000 });
  lis.cb(snapshot([pronto]));
  await esperar();
  const agora = { toMillis: () => Date.now() };
  lis.cb(snapshot([{ ...pronto, status: 'finalizado', entregueEm: agora, food99CodigoEntregaValidado: { em: agora, por: 'motoboy', papel: 'entregador' } }]));
  await esperar(); await esperar();
  const nota = notas(a, '401').find((e) => e.op === 'set');
  assert.ok(nota, 'nota pendente criada');
  assert.equal(nota.data.status, 'pendente');
  assert.equal(nota.data.pedidoId, '401');
  lis.cb(snapshot([{ ...pronto, status: 'finalizado', entregueEm: agora, food99CodigoEntregaValidado: { em: agora } }]));
  await esperar(); await esperar();
  assert.equal(notas(a, '401').length, 1, 'o mesmo snapshot de novo não cria outra');
});

test('99 (controle): sem código, código de dias atrás ou pedido não finalizado não criam nota pelo snapshot; o iFood segue igual', async () => {
  const { a, lis } = painel();
  const ontem = { toMillis: () => Date.now() - 3 * 86400000 };
  const agora = { toMillis: () => Date.now() };
  lis.cb(snapshot([
    pedido99({ id: '402', status: 'finalizado', entregueEm: agora }),                                                     // sem código
    pedido99({ id: '403', status: 'finalizado', entregueEm: ontem, food99CodigoEntregaValidado: { em: ontem } }),       // antigo
    pedido99({ id: '404', status: 'entregue', food99CodigoEntregaValidado: { em: agora } }),                            // não finalizado
    { ...pedido99({ id: '405' }), origem: 'ifood', ifoodOrderId: 'o-405', food99OrderId: undefined, pagamento: 'ifood',
      status: 'finalizado', entregueEm: agora, ifoodCodigoEntregaValidado: { em: agora } },                            // iFood: continua criando
  ]));
  await esperar(); await esperar();
  for (const id of ['402', '403', '404']) assert.equal(notas(a, id).length, 0, id);
  assert.ok(notas(a, '405').find((e) => e.op === 'set'), 'iFood validado continua criando a nota');
});
