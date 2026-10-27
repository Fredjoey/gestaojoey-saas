// TESTE — embalagem do insumo (gestao-joey.html: _parseEmbalagem / _embTxt).
//   node testes/insumo-embalagem.js     (hermético: extrai as funções do HTML, sem navegador)
//
// O caso: 27/10/2026. O Fred compra Mostarda Dijon em POTE, e pote tem 865 g — não 1 kg.
// O sistema só falava grama, então consultar preço obrigava a fazer regra de três de cabeça.
// Pior: a nota de 06/10 entrou como "1,7 kg × R$ 92,20 = R$ 128,80" — conta que não fecha
// (1,7 × 92,20 = 156,74). Eram 2 potes = 1,730 kg. O erro virou preço de insumo e inflou em
// 24% toda receita com Dijon.
//
// Grama continua sendo a unidade da RECEITA. A embalagem é só lente de leitura.
const fs = require('fs'), path = require('path'), vm = require('vm');

let falhas = 0, total = 0;
function ok(nome, real, esperado) {
  total++;
  const bate = JSON.stringify(real) === JSON.stringify(esperado);
  if (!bate) falhas++;
  console.log(`  ${bate ? 'OK   ' : 'FALHA'} ${String(nome).padEnd(54)} ${JSON.stringify(real)}${bate ? '' : `  ← esperado ${JSON.stringify(esperado)}`}`);
}

// Extrai as funções do HTML, sem carregar a página.
const SRC = fs.readFileSync(path.join(__dirname, '../gestao-joey.html'), 'utf8');
function trecho(nome) {
  const i = SRC.indexOf('function ' + nome + '(');
  if (i < 0) throw new Error('não achei ' + nome);
  let d = 0;
  for (let k = SRC.indexOf('{', i); k < SRC.length; k++) {
    if (SRC[k] === '{') d++; else if (SRC[k] === '}') { d--; if (!d) return SRC.slice(i, k + 1); }
  }
}
const ctx = { console };
vm.createContext(ctx);
const iFat = SRC.indexOf('const _EMB_FATOR');
vm.runInContext(SRC.slice(iFat, SRC.indexOf(';', iFat) + 1) + '\n' + trecho('_parseEmbalagem') + '\n' + trecho('_embTxt'), ctx);
const { _parseEmbalagem: parse, _embTxt: txt } = ctx;

console.log('\n=== 1) O pote de Dijon ===');
{
  const e = parse('865 g pote', 'g');
  ok('865 g pote → 865 g', e.qtd, 865);
  ok('guarda o nome "pote"', e.nome, 'pote');
  ok('mostra como "865 g"', txt(e, 'g'), '865 g');
  ok('preço do pote = 0,0744/g × 865', Math.round(0.0744 * e.qtd * 100) / 100, 64.36);
}

console.log('\n=== 2) kg e litro convertem para a unidade de custo ===');
{
  ok('2 kg → 2000 g', parse('2 kg saco', 'g').qtd, 2000);
  ok('1,5 L → 1500 ml', parse('1,5 L garrafa', 'ml').qtd, 1500);
  ok('1.5 L (ponto) também', parse('1.5 L', 'ml').qtd, 1500);
  ok('2 kg volta a aparecer como "2 kg"', txt({ qtd: 2000 }, 'g'), '2 kg');
  ok('500 g continua "500 g"', txt({ qtd: 500 }, 'g'), '500 g');
  ok('1,5 L volta como "1,5 L"', txt({ qtd: 1500 }, 'ml'), '1,5 L');
}

console.log('\n=== 3) Sem unidade escrita, assume a do insumo ===');
{
  ok('"865" num insumo em g', parse('865', 'g').qtd, 865);
  ok('"6" num insumo em un', parse('6 caixa', 'un').qtd, 6);
  ok('nome padrão quando não vem', parse('865', 'g').nome, 'embalagem');
}

console.log('\n=== 4) ⚠️ Não deixa misturar peso com unidade ===');
{
  ok('kg num insumo contado em un → recusa', parse('2 kg', 'un'), null);
  ok('un num insumo em g → recusa', parse('6 un', 'g'), null);
  ok('ml num insumo em g → recusa', parse('500 ml', 'g'), null);
  ok('L num insumo em ml → aceita', parse('1 L', 'ml').qtd, 1000);
}

console.log('\n=== 5) Lixo não vira embalagem ===');
{
  ok('vazio', parse('', 'g'), null);
  ok('texto sem número', parse('pote grande', 'g'), null);
  ok('zero', parse('0 g', 'g'), null);
  ok('negativo', parse('-5 g', 'g'), null);
  ok('sem embalagem, texto vazio', txt(null, 'g'), '');
}

console.log('\n=== 6) O caso real: 1,7 kg não é múltiplo de 865 g ===');
{
  const pote = parse('865 g pote', 'g').qtd;
  const emKg = 1.7 * 1000;
  const potes = emKg / pote;
  ok('1,7 kg = 1,97 potes (quebrado)', Math.round(potes * 100) / 100, 1.97);
  ok('⚠️ não é inteiro → nota suspeita', Math.abs(potes - Math.round(potes)) > 0.02, true);
  const certo = 1.730 * 1000 / pote;
  ok('1,730 kg = 2 potes exatos', Math.round(certo * 100) / 100, 2);
  ok('e esse fecha a conta: 128,80 / 1,730 kg', Math.round((128.80 / 1.730) * 100) / 100, 74.45);
}

console.log(`\n${falhas ? '✖' : '✔'} ${total - falhas}/${total}\n`);
process.exit(falhas ? 1 : 0);
