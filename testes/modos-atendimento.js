// TESTE — ligar e desligar as formas de atendimento (delivery, retirada, no local).
//   node testes/modos-atendimento.js      (hermético)
//
// Pedido do Fred junto com o almoço: poder desligar uma forma de atendimento.
// Guardado em config/loja.modos = { delivery, retirada, local }.
//
// Duas regras que importam mais que o resto:
//   · campo AUSENTE conta como LIGADO — nenhuma loja que nunca abriu esse modal
//     pode acordar amanhã sem delivery;
//   · nunca dá pra deixar as três desligadas, nem no painel nem no cardápio —
//     isso deixaria o cliente com o carrinho cheio e sem botão de finalizar.
//     Para fechar a loja existe o botão Aberto/Fechado, que é outra coisa.

const fs = require('fs'), path = require('path'), vm = require('vm');

let falhas = 0, total = 0;
function ok(nome, real, esperado) {
  total++;
  const bate = JSON.stringify(real) === JSON.stringify(esperado);
  if (!bate) falhas++;
  console.log(`  ${bate ? 'OK   ' : 'FALHA'} ${String(nome).padEnd(50)} ${JSON.stringify(real)}${bate ? '' : `  ← esperado ${JSON.stringify(esperado)}`}`);
}

function carregar(arquivo) {
  const SRC = fs.readFileSync(path.join(__dirname, '..', arquivo), 'utf8');
  return (nome) => {
    const i = SRC.indexOf('function ' + nome + '(');
    if (i < 0) throw new Error(`${arquivo}: não achei ${nome}`);
    let d = 0;
    for (let k = SRC.indexOf('{', i); k < SRC.length; k++) {
      if (SRC[k] === '{') d++; else if (SRC[k] === '}') { d--; if (!d) return SRC.slice(i, k + 1); }
    }
  };
}

console.log('\n=== 1) painel.html — o que está ligado ===');
{
  const trecho = carregar('painel.html');
  const ctx = { console, config: {} };
  vm.createContext(ctx);
  vm.runInContext(trecho('modosAtivos'), ctx);

  ok('loja antiga (sem o campo) → tudo ligado', ctx.modosAtivos({}), { delivery: true, retirada: true, local: true });
  ok('modos:null → tudo ligado',                ctx.modosAtivos({ modos: null }), { delivery: true, retirada: true, local: true });
  ok('delivery desligado',                      ctx.modosAtivos({ modos: { delivery: false } }), { delivery: false, retirada: true, local: true });
  ok('só o local ligado',                       ctx.modosAtivos({ modos: { delivery: false, retirada: false, local: true } }), { delivery: false, retirada: false, local: true });
}

console.log('\n=== 2) painel.html — não dá pra desligar tudo ===');
{
  const trecho = carregar('painel.html');
  const avisos = [];
  const ctx = { console, notify: (m) => avisos.push(m), _renderModalTempo: () => {}, _tv: {} };
  vm.createContext(ctx);
  vm.runInContext(trecho('_toggleModo'), ctx);

  ctx._tv = { on_delivery: true, on_retirada: true, on_local: true };
  ctx._toggleModo('delivery', false);
  ok('desliga o delivery',                      ctx._tv.on_delivery, false);
  ctx._toggleModo('local', false);
  ok('desliga o no local',                      ctx._tv.on_local, false);

  const antes = avisos.length;
  ctx._toggleModo('retirada', false);
  ok('o ÚLTIMO ligado não desliga',             ctx._tv.on_retirada, true);
  ok('e o dono é avisado por quê',              avisos.length > antes && /ao menos uma/.test(avisos[avisos.length - 1]), true);

  ctx._toggleModo('delivery', true);
  ok('religa normalmente',                      ctx._tv.on_delivery, true);
}

console.log('\n=== 3) cardapio.html — o que o cliente vê no checkout ===');
{
  const trecho = carregar('cardapio.html');
  const ctx = { console, CONFIG: { modos: null }, tipoEntrega: '', bairroSelecionado: null, _gpsEntrega: null };
  vm.createContext(ctx);
  vm.runInContext([trecho('_modosAtivos'), trecho('_opcoesEntrega'), trecho('_ajustarTipoEntrega')].join('\n'), ctx);
  const chaves = (mesa) => ctx._opcoesEntrega(mesa).map(o => o.key);

  ok('loja sem o campo → as três opções',       chaves(null), ['delivery', 'retirada', 'local']);

  ctx.CONFIG = { modos: { delivery: false, retirada: true, local: true } };
  ok('sem delivery → some do checkout',         chaves(null), ['retirada', 'local']);

  ctx.CONFIG = { modos: { delivery: true, retirada: false, local: false } };
  ok('só delivery → uma opção só',              chaves(null), ['delivery']);

  // Trava: tudo desligado não pode travar o cliente no carrinho.
  ctx.CONFIG = { modos: { delivery: false, retirada: false, local: false } };
  ok('tudo desligado → mostra tudo (não trava)', chaves(null), ['delivery', 'retirada', 'local']);

  // QR na mesa: o cliente já está dentro da loja, delivery não entra.
  ctx.CONFIG = { modos: null };
  ok('com QR de mesa → no local e para levar',  chaves('7'), ['local', 'retirada']);
  ctx.CONFIG = { modos: { local: false } };
  ok('mesa sem "no local" → sobra para levar',  chaves('7'), ['retirada']);
}

console.log('\n=== 4) cardapio.html — o tipo escolhido deixa de existir ===');
{
  const trecho = carregar('cardapio.html');
  const ctx = { console, CONFIG: { modos: null }, tipoEntrega: 'delivery', bairroSelecionado: { nome: 'Centro' }, _gpsEntrega: { lat: 1 } };
  vm.createContext(ctx);
  vm.runInContext([trecho('_modosAtivos'), trecho('_opcoesEntrega'), trecho('_ajustarTipoEntrega')].join('\n'), ctx);

  // Cliente montou o carrinho em delivery; o dono desligou o delivery nesse meio-tempo.
  vm.runInContext("CONFIG = { modos: { delivery: false, retirada: true, local: true } }; _ajustarTipoEntrega(null);", ctx);
  ok('cai na primeira opção que sobrou',        vm.runInContext('tipoEntrega', ctx), 'retirada');
  ok('e larga o bairro escolhido',              vm.runInContext('bairroSelecionado', ctx), null);
  ok('e larga a localização capturada',         vm.runInContext('_gpsEntrega', ctx), null);

  // Tipo ainda válido não é mexido.
  vm.runInContext("tipoEntrega = 'local'; _ajustarTipoEntrega(null);", ctx);
  ok('tipo que continua valendo fica',          vm.runInContext('tipoEntrega', ctx), 'local');
}

console.log(`\n${falhas ? '❌' : '✅'}  ${total - falhas}/${total} passaram\n`);
process.exit(falhas ? 1 : 0);
