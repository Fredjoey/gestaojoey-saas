#!/usr/bin/env node
// Confere a sintaxe de CADA bloco <script> inline de um HTML, SEPARADAMENTE.
//   node scripts/checar-blocos.js gestao-joey.html painel.html cardapio.html
//
// Por que existe: em 02/11/2026 subiu para produção um `(a ? b || 0)` — ternário
// sem o `:`. A página inteira parou de carregar ("Carregando categorias…" para
// sempre), porque um SyntaxError derruba o bloco inteiro, não só a função.
//
// O erro passou porque a conferência juntava TODOS os blocos num arquivo só e
// rodava `node --check` nele. Juntado, o parser não acusa — o primeiro bloco
// tem 1,4 MB e engole o resto. Separado, acusa na linha.
//
// Cada bloco é checado com a semântica que o navegador usaria: type="module"
// vira .mjs, o resto vira .cjs. Checar como CJS um bloco que é módulo (ou o
// contrário) produz erro falso e treina a gente a ignorar o verificador.
//
// ⚠️ Sintaxe ok NÃO é página ok: variável inexistente, função não definida e
// ordem de carregamento só aparecem abrindo a página.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const arquivos = process.argv.slice(2);
if (!arquivos.length) {
  console.error('uso: node scripts/checar-blocos.js <arquivo.html> [outro.html ...]');
  process.exit(2);
}

const RE_SCRIPT = /<script([^>]*)>([\s\S]*?)<\/script>/g;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'checar-blocos-'));
let quebrados = 0, blocosTotal = 0;

for (const arq of arquivos) {
  if (!fs.existsSync(arq)) { console.error(`✖ ${arq}: não existe`); quebrados++; continue; }
  const src = fs.readFileSync(arq, 'utf8');

  let m, i = 0, ruins = 0, contados = 0;
  while ((m = RE_SCRIPT.exec(src)) !== null) {
    const attrs = m[1] || '', js = m[2];
    i++;
    if (/\bsrc\s*=/.test(attrs)) continue;        // script externo: não é nosso código
    if (!js.trim()) continue;
    const ehModulo = /type\s*=\s*["']module["']/.test(attrs);
    const linhaInicio = src.slice(0, m.index).split('\n').length;
    blocosTotal++; contados++;

    const f = path.join(tmp, `b${blocosTotal}.${ehModulo ? 'mjs' : 'cjs'}`);
    fs.writeFileSync(f, js);
    try {
      execFileSync(process.execPath, ['--check', f], { stdio: ['ignore', 'ignore', 'pipe'] });
    } catch (e) {
      ruins++; quebrados++;
      const err = String((e.stderr || '')).trim();
      const mLinha = new RegExp(`b${blocosTotal}\\.(?:mjs|cjs):(\\d+)`).exec(err);
      console.error(`\n✖ ${arq} — bloco ${i}${ehModulo ? ' (module)' : ''}, começa na linha ${linhaInicio}`);
      if (mLinha) console.error(`  → linha ${linhaInicio + Number(mLinha[1]) - 1} do arquivo`);
      console.error(err.split('\n').slice(0, 6).map((l) => '  ' + l).join('\n'));
    }
  }
  if (!ruins) console.log(`✓ ${arq} — ${contados} bloco(s) inline, sintaxe ok`);
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${quebrados ? '❌' : '✅'}  ${blocosTotal - quebrados}/${blocosTotal} bloco(s) ok`);
process.exit(quebrados ? 1 : 0);
