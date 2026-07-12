/**
 * TESTE — botão "👁 Ver a rua" (Street View) do mapa de entregas.
 * Extrai a função REAL do painel.html (não reimplementa) e confere:
 *   - a URL montada bate com o formato oficial da Maps URLs API
 *   - sem coordenada → sem link (o botão não aparece)
 *   - a URL responde (HTTP 200) — não valida se HÁ panorama no ponto, só que o link vive
 *
 * Uso: node scripts/testar_street_view.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'painel.html'), 'utf8');
let falhas = 0, testes = 0;
const ok = (nome, cond, det) => {
  testes++; if (!cond) falhas++;
  console.log(`   ${cond ? '✅' : '❌'} ${nome}${det ? '\n        ' + det : ''}`);
};

const m = SRC.match(/function streetViewUrl\(lat, lng\)\s*\{[\s\S]*?\n\}/);
if (!m) { console.error('❌ streetViewUrl não encontrada no painel.html'); process.exit(1); }
const ctx = {}; vm.createContext(ctx);
vm.runInContext(m[0] + '\nthis.streetViewUrl = streetViewUrl;', ctx);
const { streetViewUrl } = ctx;

// coordenada REAL gravada pelo geocoding do Google (pedido 34160, casa exata)
const LAT = -22.465525, LNG = -42.658989;

(async () => {
  console.log('\n══ 1. URL montada ══\n');
  const url = streetViewUrl(LAT, LNG);
  console.log(`   ${url}\n`);
  ok('formato oficial (map_action=pano + viewpoint)',
    url.startsWith('https://www.google.com/maps/@?api=1&map_action=pano&viewpoint='));
  ok('leva a coordenada do pedido', url.includes(`viewpoint=${LAT},${LNG}`));

  console.log('\n══ 2. Sem coordenada → sem botão ══\n');
  ok('lat/lng null → string vazia (o popup omite o botão)',
    streetViewUrl(null, null) === '' && streetViewUrl(undefined, LNG) === '');

  console.log('\n══ 3. O popup só monta o botão quando há coordenada ══\n');
  const trecho = SRC.match(/const sv = streetViewUrl\(p\.geoLat, p\.geoLng\);[\s\S]{0,420}/);
  ok('o botão é condicional ao `sv` (ternário no popup)',
    !!trecho && /const svBtn = sv\s*\n?\s*\?/.test(trecho[0]));
  ok('abre em aba nova, com rel=noopener',
    !!trecho && trecho[0].includes('target="_blank"') && trecho[0].includes('rel="noopener"'));

  console.log('\n══ 4. O link responde? (não prova que há panorama no ponto) ══\n');
  try {
    const r = await fetch(url, { method: 'GET', redirect: 'follow' });
    ok(`HTTP ${r.status} do Google Maps`, r.status === 200, 'o Google resolve a URL (o panorama em si só o navegador mostra)');
  } catch (e) {
    console.log(`   ⚠️  sem rede para checar (${e.message}) — não conta como falha`);
  }

  console.log('\n' + '─'.repeat(60));
  console.log(`${falhas === 0 ? '✅ TODOS OS TESTES PASSARAM' : '❌ ' + falhas + ' FALHA(S)'} — ${testes - falhas}/${testes}`);
  // exitCode em vez de process.exit(): com um fetch ainda fechando, o exit imediato
  // dispara um assert do libuv no Windows e suja o código de saída.
  process.exitCode = falhas === 0 ? 0 : 1;
})();
