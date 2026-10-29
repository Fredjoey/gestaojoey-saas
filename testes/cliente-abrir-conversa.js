// TESTE — botão WhatsApp do Relatório de Clientes abre a conversa NO PAINEL (painel.html).
//   node testes/cliente-abrir-conversa.js    (hermético: extrai a função do HTML, sem navegador)
//
// Pedido do Fred (29/10/2026): clicar no 💬 WhatsApp do Top 10 Clientes e a conversa abrir na
// gaveta do próprio painel, sem sair pro WhatsApp e perder o contexto do relatório.
//
// O miolo é o casamento telefone → conversa. O relatório mostra "(21) 99983-5738"; a conversa
// pode estar gravada como 5521999835738, 21999835738, ou sob um LID (100292435665097) com o
// telefone só no campo `numero`. Comparar string inteira erraria em todos. Por isso: 8 últimos
// dígitos, a mesma regra do ehDaEquipe no joeyapi.
const fs = require('fs'), path = require('path'), vm = require('vm');

let falhas = 0, total = 0;
function ok(nome, real, esperado) {
  total++;
  const bate = JSON.stringify(real) === JSON.stringify(esperado);
  if (!bate) falhas++;
  console.log(`  ${bate ? 'OK   ' : 'FALHA'} ${String(nome).padEnd(56)} ${JSON.stringify(real)}${bate ? '' : `  ← esperado ${JSON.stringify(esperado)}`}`);
}

const SRC = fs.readFileSync(path.join(__dirname, '../painel.html'), 'utf8');
function trecho(nome) {
  const i = SRC.indexOf('function ' + nome + '(');
  if (i < 0) throw new Error('não achei ' + nome);
  let d = 0;
  for (let k = SRC.indexOf('{', i); k < SRC.length; k++) {
    if (SRC[k] === '{') d++; else if (SRC[k] === '}') { d--; if (!d) return SRC.slice(i, k + 1); }
  }
}
const ctx = { console, _wppConversas: [] };
vm.createContext(ctx);
vm.runInContext(trecho('_cliConvDoTelefone') + '\n' + trecho('cliWppBtn'), ctx);
const achar = t => { const c = ctx._cliConvDoTelefone(t); return c ? c.id : null; };

ctx._wppConversas = [
  { id: '5521999835738', numero: '5521999835738', nome: 'Angelica' },
  { id: '100292435665097', numero: '5521964799014', nome: 'Dilmar (LID)' },
  { id: '21995490289',    numero: '21995490289',   nome: 'Emilio (sem 55)' },
  { id: '5521981504720',  nome: 'Manu (sem campo numero)' },
];

console.log('\n=== 1) Como o relatório entrega o telefone ===');
{
  ok('"(21) 99983-5738" acha a conversa', achar('(21) 99983-5738'), '5521999835738');
  ok('só dígitos também', achar('21999835738'), '5521999835738');
  ok('com 55 na frente', achar('5521999835738'), '5521999835738');
}

console.log('\n=== 2) ⚠️ Conversa gravada sob LID ===');
{
  ok('acha pelo campo numero, não pelo id', achar('(21) 96479-9014'), '100292435665097');
}

console.log('\n=== 3) Conversa sem o 55, e sem campo numero ===');
{
  ok('numero sem 55', achar('(21) 99549-0289'), '21995490289');
  ok('cai no id quando não há numero', achar('(21) 98150-4720'), '5521981504720');
}

console.log('\n=== 4) Não inventa parentesco ===');
{
  ok('telefone desconhecido → null', achar('(21) 90000-0000'), null);
  ok('vazio → null', achar(''), null);
  ok('curto demais (< 8 dígitos) → null', achar('1234567'), null);
  ok('nulo → null', achar(null), null);
}

console.log('\n=== 5) O botão ===');
{
  const html = ctx.cliWppBtn('(21) 99983-5738');
  ok('virou <button>, não link que sai do painel', /^<button/.test(html.trim()), true);
  ok('não aponta mais pro wa.me', /wa\.me/.test(html), false);
  ok('chama cliAbrirWpp com só os dígitos', /cliAbrirWpp\('21999835738'\)/.test(html), true);
  ok('sem telefone não desenha botão', ctx.cliWppBtn(''), '—');
}

console.log(`\n${falhas ? '✖' : '✔'} ${total - falhas}/${total}\n`);
process.exit(falhas ? 1 : 0);
