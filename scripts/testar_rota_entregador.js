/**
 * TESTE — link de rota do entregador (app nativo primeiro; web com origem=GPS de fallback).
 *
 * Não reimplementa a lógica: EXTRAI as funções reais do entregador.html e as roda num
 * sandbox com `document`, `window` e `navigator.geolocation` simulados (e userAgent/platform
 * controláveis, pra testar Android × iOS). Se o arquivo mudar de forma que quebre a rota,
 * o teste quebra.
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

// Extrai o bloco real: de `function destinoRota` até imediatamente antes de `function render`.
// Isso cobre tanto a montagem das URLs web (destinoRota…fecharRota) quanto as cadeias de app
// nativo e o GPS quente (_rotaMontarCadeias / _abrirCadeia / abrirApp / _gpsQuenteFresco).
const bloco = SRC.match(/function destinoRota[\s\S]*?(?=function render\(lista\))/);
if (!bloco) { console.error('❌ não achei o bloco da rota no entregador.html'); process.exit(1); }

// Monta o sandbox: DOM fake + geolocation controlável + plataforma (userAgent/platform).
// `navegou` captura, em ordem, cada window.location.href atribuído (as tentativas de abrir app/web).
function montarCtx(gps, plat) {
  plat = plat || {};
  const navegou = [];
  const els = {
    rotaGoogle: { href: '' }, rotaWaze: { href: '' }, rotaApple: { href: '' },
    rotaStatus: { textContent: '', style: {} },
    rotaSheet: { _c: new Set(), classList: { add(x) { els.rotaSheet._c.add(x); }, remove(x) { els.rotaSheet._c.delete(x); }, contains(x) { return els.rotaSheet._c.has(x); } } },
  };
  const loc = {};
  Object.defineProperty(loc, 'href', { get() { return navegou[navegou.length - 1] || ''; }, set(v) { navegou.push(v); } });
  const doc = { getElementById: (id) => els[id] || null, addEventListener() {}, removeEventListener() {}, hidden: false };
  const win = { location: loc, addEventListener() {}, removeEventListener() {} };
  const ctx = {
    document: doc,
    window: win,
    location: loc,
    Date,
    navigator: {
      userAgent: plat.ua || '',
      platform: plat.platform || '',
      maxTouchPoints: plat.maxTouchPoints || 0,
      geolocation: {
        getCurrentPosition(sucesso, erro) {
          if (gps && gps !== 'ausente') setTimeout(() => sucesso({ coords: { latitude: gps.lat, longitude: gps.lng } }), 5);
          else                          setTimeout(() => erro({ code: 1, message: 'User denied Geolocation' }), 5);
        },
        watchPosition() { return 1; },
      },
    },
    _lojaGeo: { cidade: 'Cachoeiras de Macacu', estado: 'Rio de Janeiro' },
    setTimeout, encodeURIComponent, Promise, Number,
    console: { log: () => {} },
  };
  if (gps === 'ausente') ctx.navigator.geolocation = undefined;
  vm.createContext(ctx);
  vm.runInContext(bloco[0] + '\nthis.api = { destinoRota, abrirRotaMenu, fecharRota, abrirApp, getNativo: () => _rotaNativo };', ctx);
  return { ctx, els, navegou };
}

const GPS_MOTOBOY = { lat: -22.470111, lng: -42.661222 };   // ele está na rua, longe da loja

// UA reais o suficiente pra ligar os ramos _isAndroid / _isIOS.
const PLAT_ANDROID = { ua: 'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36' };
const PLAT_IOS     = { ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1', platform: 'iPhone' };

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

  console.log('\n══ 2. MOTOBOY PERMITE O GPS → a URL web parte de onde ele está ══\n');
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
    ok('Google (web) recebeu origin = GPS do motoboy', els.rotaGoogle.href.includes('origin=-22.470111%2C-42.661222'));
    ok('Google mantém o destino (a casa)', els.rotaGoogle.href.includes('destination=-22.465525%2C-42.658989'));
    ok('Apple (web) recebeu saddr = GPS do motoboy', els.rotaApple.href.includes('saddr=-22.470111%2C-42.661222'));
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
    ok('SEM origin na web (o app decide)', !els.rotaGoogle.href.includes('origin='));
    ok('Waze usa q= (texto)', els.rotaWaze.href.includes('q=Rua%20das%20Azal'));
    ok('status "sem GPS" instrui abrir no navegador', els.rotaStatus.textContent.includes('Sem GPS') && /Chrome\/Safari|navegador/.test(els.rotaStatus.textContent));
  }

  console.log('\n══ 4. NAVEGADOR SEM GEOLOCATION (WebView antiga) → fallback ══\n');
  {
    const { ctx, els } = montarCtx('ausente');
    const d = ctx.api.destinoRota(PEDIDO_EXATO);
    ctx.api.abrirRotaMenu(encodeURIComponent(d.txt), d.coord);
    await esperar(60);
    ok('não quebra e abre sem origin', els.rotaSheet.classList.contains('show') && !els.rotaGoogle.href.includes('origin='));
  }

  console.log('\n══ 5. ANDROID — app nativo primeiro (google.navigation:), sem origem no esquema nativo ══\n');
  {
    const { ctx, navegou } = montarCtx(GPS_MOTOBOY, PLAT_ANDROID);
    const d = ctx.api.destinoRota(PEDIDO_EXATO);
    ctx.api.abrirRotaMenu(encodeURIComponent(d.txt), d.coord);
    await esperar(60);
    const nat = ctx.api.getNativo();
    console.log('   GOOGLE:', JSON.stringify(nat.google));
    console.log('   WAZE  :', JSON.stringify(nat.waze));
    console.log('   APPLE :', JSON.stringify(nat.apple), '\n');
    ok('Google: 1º elo = google.navigation: (app nativo)', nat.google[0] === 'google.navigation:q=-22.465525%2C-42.658989&mode=d');
    ok('Google nativo NÃO leva origem (o app usa o GPS do aparelho)', nat.google[0].indexOf('origin=') === -1);
    ok('Google: último elo = web COM origin=<GPS> (fallback)',
      /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1/.test(nat.google[nat.google.length - 1]) && nat.google[nat.google.length - 1].includes('origin=-22.470111%2C-42.661222'));
    ok('Waze: 1º elo = waze:// (ll= p/ coordenada)', nat.waze[0] === 'waze://?ll=-22.465525%2C-42.658989&navigate=yes');
    ok('Apple no Android = só web (não há app Apple no Android)', nat.apple.length === 1 && /^https:\/\/maps\.apple\.com/.test(nat.apple[0]));
    ctx.api.abrirApp('google');
    ok('abrirApp("google") dispara o esquema nativo ANTES da web', navegou[0] === nat.google[0]);
  }

  console.log('\n══ 6. iOS — comgooglemaps:// → maps:// (Apple) → web ══\n');
  {
    const { ctx, navegou } = montarCtx(GPS_MOTOBOY, PLAT_IOS);
    const d = ctx.api.destinoRota(PEDIDO_EXATO);
    ctx.api.abrirRotaMenu(encodeURIComponent(d.txt), d.coord);
    await esperar(60);
    const nat = ctx.api.getNativo();
    console.log('   GOOGLE:', JSON.stringify(nat.google));
    console.log('   APPLE :', JSON.stringify(nat.apple), '\n');
    ok('Google iOS: comgooglemaps:// primeiro', nat.google[0] === 'comgooglemaps://?daddr=-22.465525%2C-42.658989&directionsmode=driving');
    ok('Google iOS: cai pra maps:// (Apple) antes da web', nat.google[1] === 'maps://?daddr=-22.465525%2C-42.658989&dirflg=d');
    ok('Google iOS: web é o último elo (com origin)', /^https:\/\/www\.google\.com\/maps\/dir/.test(nat.google[2]) && nat.google[2].includes('origin=-22.470111%2C-42.661222'));
    ok('nenhum esquema nativo do iOS leva origem/saddr',
      nat.google[0].indexOf('origin=') === -1 && nat.google[0].indexOf('saddr=') === -1 && nat.google[1].indexOf('saddr=') === -1);
    ok('Apple iOS: maps:// e depois web', nat.apple[0] === 'maps://?daddr=-22.465525%2C-42.658989&dirflg=d' && /^https:\/\/maps\.apple\.com/.test(nat.apple[1]));
    ctx.api.abrirApp('google');
    ok('abrirApp("google") no iOS abre comgooglemaps:// primeiro', navegou[0] === 'comgooglemaps://?daddr=-22.465525%2C-42.658989&directionsmode=driving');
  }

  console.log('\n══ 7. WAZE por TEXTO (destino sem coordenada) usa q= também no app ══\n');
  {
    const { ctx } = montarCtx(GPS_MOTOBOY, PLAT_ANDROID);
    const d = ctx.api.destinoRota(PEDIDO_TEXTO);
    ctx.api.abrirRotaMenu(encodeURIComponent(d.txt), d.coord);
    await esperar(60);
    const nat = ctx.api.getNativo();
    console.log('   WAZE  :', JSON.stringify(nat.waze), '\n');
    ok('Waze nativo usa q= quando o destino é texto', nat.waze[0].startsWith('waze://?q=Rua%20das%20Azal') && nat.waze[0].includes('navigate=yes'));
  }

  console.log('\n' + '─'.repeat(64));
  console.log(`${falhas === 0 ? '✅ TODOS OS TESTES PASSARAM' : '❌ ' + falhas + ' FALHA(S)'} — ${testes - falhas}/${testes}`);
  process.exit(falhas === 0 ? 0 : 1);
})();
