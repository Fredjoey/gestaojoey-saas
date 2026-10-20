// 99Food: o aviso de WhatsApp ao motoboy (painel) e o app do motoboy dizem a mesma coisa para pedido da 99 — pago online
// ('99food') = não cobrar; Pix da 99 (offline, cobrado na entrega) = receber; dinheiro/cartão da 99 = receber.
const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar } = require('./sandbox');

const hoje = () => new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
const base = (extra) => ({
  id: '501', data: hoje(), hora: '19:00', ts: Date.now(), status: 'entregue', entrega: 'delivery', itens: [{ qty: 1, nome: 'X-Burger', preco: 30 }],
  subtotal: 30, taxaEntrega: 5, total: 35, cliente: { nome: 'Ana', tel: '', rua: 'Rua A', numero: '10', bairro: 'Centro' },
  origem: '99food', food99OrderId: '5764612234567890123', food99TipoEntrega: 2, entregadorId: 'm1', ...extra,
});

async function aviso(p) {
  const a = carregar('painel.html');
  a.rodar("slug = 'joey'");
  a.fs.docs['clientes/joey/motoboys/m1'] = { nome: 'João', telefone: '21988887777', slug: 'joao-x1' };
  const env = [];
  a.ctx.__env = env;
  a.rodar('enviarWhatsAppBot = (tel, msg, tpl) => { __env.push({ msg, tpl }); }');
  a.ctx.__p = p;
  await a.rodar('notificarMotoboyEntrega(__p)');
  assert.equal(env.length, 1);
  return { linha: env[0].msg.split('\n')[3], tpl: env[0].tpl.params[4] };
}
function noApp(p) {
  const e = carregar('entregador.html', { busca: '' });
  e.ctx.__l = [p];
  e.rodar('render(__l)');
  const m = e.elementos.conteudo.innerHTML.match(/<div class="pag"><span class="[^"]+">([^<]*)<\/span>/);
  return m ? m[1] : '';
}

test('99: aviso ao motoboy segue a regra do app (pago na 99 = não cobrar; Pix/dinheiro/cartão da 99 = receber)', async () => {
  const casos = [
    [{ pagamento: '99food' }, '📱 Pago no app · não cobrar', 'Pago no app, não cobrar', /Pago na 99/],
    [{ pagamento: 'pix', pagamentoManual: true }, '📱 Pix na entrega · receber R$ 35,00', 'Pix na entrega, receber 35,00', /Pix na entrega · receber/],
    [{ pagamento: 'pix' }, '📱 Pix na entrega · receber R$ 35,00', 'Pix na entrega, receber 35,00', /Pix na entrega · receber/],
    [{ pagamento: 'dinheiro', troco: 50, pagamentoManual: true }, '💵 Dinheiro · receber R$ 35,00 · troco p/ R$ 50,00 (levar R$ 15,00)', 'Dinheiro, receber 35,00, troco para 50,00 (levar 15,00)', /Dinheiro · troco p\/ R\$ 50,00 · receber/],
    [{ pagamento: 'credito', pagamentoManual: true }, '💳 Cartão na entrega · receber R$ 35,00 · levar maquininha', 'Cartão na entrega, receber 35,00, levar maquininha', /Cartão na entrega · receber/],
  ];
  for (const [extra, linha, tpl, app] of casos) {
    const p = base(extra);
    const r = await aviso(p);
    assert.equal(r.linha, linha, JSON.stringify(extra));
    assert.equal(r.tpl, tpl, JSON.stringify(extra));
    assert.match(noApp(p), app, JSON.stringify(extra));
  }
});
