/**
 * TESTE — link de rota do entregador (origem = GPS do motoboy, com fallback).
 *
 * Não reimplementa a lógica: EXTRAI as funções reais do entregador.html e as roda
 * num sandbox com `document` e `navigator.geolocation` simulados. Se o arquivo
 * mudar de forma que quebre a rota, o teste quebra.
 *
 * Uso: node scripts/testar_rota_entregador.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'entregador.html'), 'utf8');
let falhas = 0, testes = 0;

function ok(nome, cond, detalhe) {
  testes++;
  if (!cond) falhas++;
  console.log(`   ${cond ? '✅' : '❌'} ${nome}${detalhe ? '\n        ' + detalhe : ''}`);
}

// Extrai o bloco real: de `function destinoRota` até o fim de `fecharRota`
const bloco = SRC.match(/function destinoRota[\s\S]*?function fecharRota\(\)[^\n]*\n/);
if (!bloco) { console.error('❌ não achei o bloco da rota no entregador.html'); process.exit(1); }

// Monta o sandbox: DOM fake + geolocation controlável
function montarCtx(gps) {
  const els = {
    rotaGoogle: { href: '' }, rotaWaze: { href: '' }, rotaApple: { href: '' },
    rotaStatus: { textContent: '', style: {} },
    rotaSheet: { _c: new Set(), classList: { add(x) { els.rotaSheet._c.add(x); }, remove(x) { els.rotaSheet._c.delete(x); }, contains(x) { return els.rotaSheet._c.has(x); } } },
  };
  const ctx = {
    document: { getElementById: (id) => els[id] || null },
    navigator: {
      geolocation: {
        getCurrentPosition(sucesso, erro) {
          if (gps) setTimeout(() => sucesso({ coords: { latitude: gps.lat, longitude: gps.lng } }), 5);
          else     setTimeout(() => erro({ code: 1, message: 'User denied Geolocation' }), 5);
        },
      },
    },
    _lojaGeo: { cidade: 'Cachoeiras de Macacu', estado: 'Rio de Janeiro' },
    setTimeout, encodeURIComponent, Promise, Number,
    console: { log: () => {} },
  };
  ctx.navigator.geolocation = gps === 'ausente' ? undefined : ctx.navigator.geolocation;
  vm.createContext(ctx);
  vm.runInContext(bloco[0] + '\nthis.api = { destinoRota, abrirRotaMenu, fecharRota };', ctx);
  return { ctx, els };
}

const GPS_MOTOBOY = { lat: -22.470111, lng: -42.661222 };   // ele está na rua, longe da loja

// Pedido com a casa achada pelo Google (geoPrecisao 'exato')
const PEDIDO_EXATO = {
  id: '34160', geoPrecisao: 'exato', geoLat: -22.465525, geoLng: -42.658989,
  cliente: { rua: 'Rua Engenheiro Ciro Rodrigues', numero: '19', bairro: 'Ganguri de Baixo' },
};
// Pedido sem coordenada confiável (só a rua / condomínio / nada)
const PEDIDO_TEXTO = {
  id: '34161', geoPrecisao: 'aproximado', geoLat: -22.571774, geoLng: -42.699088,
  cliente: { rua: 'Rua das Azaléias', numero: '80', bairro: 'Village 2' },
};

const esperar = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log('\n══ 1. DESTINO — coordenada só quando o Google achou a CASA ══\n');
  {
    const { ctx } = montarCtx(GPS_MOTOBOY);
    const d1 = ctx.api.destinoRota(PEDIDO_EXATO);
    ok('geoPrecisao "exato" → usa a COORDENADA', d1.coord === true && d1.txt === '-22.465525,-42.658989', `destino: ${d1.txt}`);
    const d2 = ctx.api.destinoRota(PEDIDO_TEXTO);
    ok('geoPrecisao "aproximado" → usa o TEXTO (a coord seria a rua errada)',
      d2.coord === false && d2.txt === 'Rua das Azaléias, 80, Village 2, Cachoeiras de Macacu, Rio de Janeiro', `destino: ${d2.txt}`);
  }

  console.log('\n══ 2. MOTOBOY PERMITE O GPS → rota parte de onde ele está ══\n');
  {
    const { ctx, els } = montarCtx(GPS_MOTOBOY);
    const d = ctx.api.destinoRota(PEDIDO_EXATO);
    ctx.api.abrirRotaMenu(encodeURIComponent(d.txt), d.coord);
    ok('menu abre NA HORA (não espera o GPS)', els.rotaSheet.classList.contains('show'));
    ok('links já saem utilizáveis antes do GPS (fallback pronto)', els.rotaGoogle.href.includes('destination=') && !els.rotaGoogle.href.includes('origin='));
    await esperar(60);
    console.log(`\n   GOOGLE: ${els.rotaGoogle.href}`);
    console.log(`   WAZE  : ${els.rotaWaze.href}`);
    console.log(`   APPLE : ${els.rotaApple.href}\n`);
    ok('Google recebeu origin = GPS do motoboy', els.rotaGoogle.href.includes('origin=-22.470111%2C-42.661222'));
    ok('Google mantém o destino (a casa)', els.rotaGoogle.href.includes('destination=-22.465525%2C-42.658989'));
    ok('Apple recebeu saddr = GPS do motoboy', els.rotaApple.href.includes('saddr=-22.470111%2C-42.661222'));
    ok('Waze usa ll= (formato de coordenada) e navega do GPS do app', els.rotaWaze.href.includes('ll=-22.465525%2C-42.658989') && els.rotaWaze.href.includes('navigate=yes'));
    ok('status avisa que a rota parte da posição dele', els.rotaStatus.textContent.includes('parte de onde você está'));
  }

  console.log('\n══ 3. MOTOBOY NEGA A PERMISSÃO → fallback, a rota NÃO trava ══\n');
  {
    const { ctx, els } = montarCtx(null);          // getCurrentPosition chama o callback de erro
    const d = ctx.api.destinoRota(PEDIDO_TEXTO);
    ctx.api.abrirRotaMenu(encodeURIComponent(d.txt), d.coord);
    await esperar(60);
    console.log(`\n   GOOGLE: ${els.rotaGoogle.href}\n`);
    ok('link do Google continua válido (com destino)', els.rotaGoogle.href.startsWith('https://www.google.com/maps/dir/?api=1&destination='));
    ok('SEM origin (comportamento antigo — o app decide)', !els.rotaGoogle.href.includes('origin='));
    ok('Waze usa q= (texto)', els.rotaWaze.href.includes('q=Rua%20das%20Azal'));
    ok('status avisa que está sem GPS', els.rotaStatus.textContent.includes('Sem GPS'));
  }

  console.log('\n══ 4. NAVEGADOR SEM GEOLOCATION (WebView antiga) → fallback ══\n');
  {
    const { ctx, els } = montarCtx('ausente');
    const d = ctx.api.destinoRota(PEDIDO_EXATO);
    ctx.api.abrirRotaMenu(encodeURIComponent(d.txt), d.coord);
    await esperar(60);
    ok('não quebra e abre sem origin', els.rotaSheet.classList.contains('show') && !els.rotaGoogle.href.includes('origin='));
  }

  console.log('\n' + '─'.repeat(64));
  console.log(`${falhas === 0 ? '✅ TODOS OS TESTES PASSARAM' : '❌ ' + falhas + ' FALHA(S)'} — ${testes - falhas}/${testes}`);
  process.exit(falhas === 0 ? 0 : 1);
})();
