// TESTE — custo real da folha (aba RH do gestao-joey.html).
//   node testes/rh-custo-folha.js      (hermético, sem navegador)
//
// O Fred perguntou quanto custa de verdade um funcionário de salário mínimo.
// A conta que corre na internet dá ~1,8× o salário — e está ERRADA para ele.
// Nos Anexos I, II, III e V do Simples a contribuição patronal (20%) já está
// dentro do DAS; só o Anexo IV recolhe por fora. O fator real é ~1,3×.
//
// Errar isso para cima faz ele não contratar quem precisa; errar para baixo
// faz a folha comer o lucro sem aparecer. Por isso cada parcela é conferida
// separada, e não só o total.

const fs = require('fs'), path = require('path'), vm = require('vm');

let falhas = 0, total = 0;
function ok(nome, real, esperado) {
  total++;
  const bate = JSON.stringify(real) === JSON.stringify(esperado);
  if (!bate) falhas++;
  console.log(`  ${bate ? 'OK   ' : 'FALHA'} ${String(nome).padEnd(50)} ${JSON.stringify(real)}${bate ? '' : `  ← esperado ${JSON.stringify(esperado)}`}`);
}
const c2 = (n) => Math.round(n * 100) / 100;

const SRC = fs.readFileSync(path.join(__dirname, '../gestao-joey.html'), 'utf8');
function trecho(nome) {
  const i = SRC.indexOf('function ' + nome + '(');
  if (i < 0) throw new Error('não achei ' + nome);
  let d = 0;
  for (let k = SRC.indexOf('{', i); k < SRC.length; k++) {
    if (SRC[k] === '{') d++; else if (SRC[k] === '}') { d--; if (!d) return SRC.slice(i, k + 1); }
  }
}
const ctx = { console, Date, Number, Math, String, isNaN };
vm.createContext(ctx);
const iConst = SRC.indexOf('const RH_FGTS');
vm.runInContext(
  SRC.slice(iConst, SRC.indexOf('let funcionarios', iConst)) +
  '\nvar rhCfg = { anexoIV: false, provisionarMulta: true };\n' +
  SRC.match(/const _rhN = .*/)[0] + '\n' +
  [trecho('rhCustoFuncionario'), trecho('rhMesesTrabalhados'), trecho('rhProvisaoAcumulada'), trecho('rhTotais')].join('\n'),
  ctx
);
const { rhCustoFuncionario: custo, rhMesesTrabalhados: meses, rhProvisaoAcumulada: prov, rhTotais: totais } = ctx;

// Salário mínimo de 2026 (Decreto 12.797/2025, vigente desde 01/01/2026).
const MIN = 1621.00;
const SEM_ANEXO_IV = { anexoIV: false, provisionarMulta: true };

console.log('\n=== 1) um salário mínimo, Simples Anexo I/III ===');
{
  const r = custo({ tipo: 'clt', salario: MIN }, SEM_ANEXO_IV);
  ok('FGTS 8%',                     c2(r.fgts), 129.68);
  ok('13º (1/12)',                  c2(r.decimo), 135.08);
  ok('FGTS do 13º',                 c2(r.fgtsDecimo), 10.81);
  ok('férias (1/12)',               c2(r.ferias), 135.08);
  ok('1/3 de férias',               c2(r.tercoFerias), 45.03);
  ok('FGTS de férias + 1/3',        c2(r.fgtsFerias), 14.41);
  ok('multa de 40% provisionada',   c2(r.multaFgts), 61.96);
  ok('patronal NÃO entra',          r.cpp, 0);

  ok('sai do caixa no mês',         c2(r.caixa), 1750.68);
  ok('provisão do mês',             c2(r.provisao), 402.37);
  ok('CUSTO REAL',                  c2(r.total), 2153.05);
  ok('fator sobre o salário',       Number(r.fator.toFixed(4)), 1.3282);
}

console.log('\n=== 2) o mesmo salário no Anexo IV (patronal por fora) ===');
{
  const r = custo({ tipo: 'clt', salario: MIN }, { anexoIV: true, provisionarMulta: true });
  ok('patronal 20% entra',          c2(r.cpp), 324.20);
  ok('custo sobe',                  c2(r.total), 2477.25);
  ok('fator vira ~1,53',            Number(r.fator.toFixed(4)), 1.5282);
  // A diferença entre os dois anexos é dinheiro de verdade todo mês.
  const semIV = custo({ tipo: 'clt', salario: MIN }, SEM_ANEXO_IV);
  ok('diferença por pessoa/mês',    c2(r.total - semIV.total), 324.20);
}

console.log('\n=== 3) sem provisionar a multa (quem não pretende demitir) ===');
{
  const r = custo({ tipo: 'clt', salario: MIN }, { anexoIV: false, provisionarMulta: false });
  ok('multa zerada',                r.multaFgts, 0);
  ok('custo sem a multa',           c2(r.total), 2091.09);
  ok('fator 1,29',                  Number(r.fator.toFixed(4)), 1.2900);
}

console.log('\n=== 4) vale-transporte: 6% sai do funcionário ===');
{
  // VT de R$ 200: a loja desconta até 6% do salário (R$ 97,26) e paga o resto.
  const r = custo({ tipo: 'clt', salario: MIN, vt: 200 }, SEM_ANEXO_IV);
  ok('desconto limitado a 6%',      c2(r.vtDesconto), 97.26);
  ok('custo real do VT',            c2(r.vtLiquido), 102.74);
  ok('entra no caixa, não na provisão', c2(r.caixa), c2(1750.68 + 102.74));

  // VT barato: desconta só o que existe, nunca mais que o próprio VT.
  const b = custo({ tipo: 'clt', salario: MIN, vt: 50 }, SEM_ANEXO_IV);
  ok('VT menor que 6% → custo zero', c2(b.vtLiquido), 0);
  ok('e desconta só os R$ 50',       c2(b.vtDesconto), 50);
}

console.log('\n=== 5) quem não é CLT não gera encargo ===');
{
  const pj = custo({ tipo: 'pj', salario: 3000 }, SEM_ANEXO_IV);
  ok('PJ: custo = o combinado',     c2(pj.total), 3000);
  ok('PJ: sem FGTS',                pj.fgts, 0);
  ok('PJ: sem 13º nem férias',      [pj.decimo, pj.ferias], [0, 0]);
  ok('PJ: fator 1,0',               pj.fator, 1);

  const di = custo({ tipo: 'diarista', salario: 1200, outrosBen: 100 }, SEM_ANEXO_IV);
  ok('diarista + extra',            c2(di.total), 1300);
}

console.log('\n=== 6) meses trabalhados (regra dos 15 dias) ===');
ok('01/01 → 01/02 = 1 mês',         meses('2026-01-01', '2026-02-01'), 1);
ok('01/01 → 15/01 = 1 (15 dias)',   meses('2026-01-01', '2026-01-16'), 1);
ok('01/01 → 10/01 = 0',             meses('2026-01-01', '2026-01-10'), 0);
// Atravessa a virada do mês: 16 dias corridos, mês cheio pela CLT. Comparar
// só o dia do mês (5 < 20) dava ZERO aqui — era bug, achado por este teste.
ok('20/01 → 05/02 = 1 (16 dias corridos)', meses('2026-01-20', '2026-02-05'), 1);
ok('20/01 → 02/02 = 0 (13 dias)',   meses('2026-01-20', '2026-02-02'), 0);
ok('31/01 → 28/02 = 1',             meses('2026-01-31', '2026-02-28'), 1);
ok('admissão no futuro = 0',        meses('2026-12-01', '2026-11-02'), 0);
ok('sem data = 0',                  meses(null, '2026-11-02'), 0);
ok('um ano cheio',                  meses('2025-11-02', '2026-11-02'), 12);

console.log('\n=== 7) o que já se deve hoje ===');
{
  // Admitido em 01/03/2026, hoje 02/11/2026. 8 meses no ano; 8 meses desde
  // a admissão (o aniversário de 2026 ainda não chegou).
  const f = { tipo: 'clt', salario: MIN, admissao: '2026-03-01' };
  const p = prov(f, '2026-11-02', SEM_ANEXO_IV);
  ok('meses para o 13º',            p.meses13, 8);
  ok('13º já devido',               c2(p.decimo), 1080.67);
  ok('meses de férias',             p.mesesFerias, 8);
  ok('férias + 1/3 devidos',        c2(p.ferias + p.tercoFerias), 1440.89);
  ok('FGTS acumulado (estimado)',   c2(p.fgtsAcum), 1123.89);
  ok('multa de 40%',                c2(p.multa), 449.56);
  ok('TOTAL já devido',             c2(p.total), 2971.11);
  // O total é a soma SEM arredondar no meio — somar parcelas já arredondadas
  // dá um centavo a mais, e foi o que este teste pegou na primeira vez.
  ok('total = soma das parcelas',     c2(p.total), c2(p.decimo + p.ferias + p.tercoFerias + p.multa));

  // Quem entrou ontem não deve quase nada — a provisão acompanha o tempo de casa.
  const novo = prov({ tipo: 'clt', salario: MIN, admissao: '2026-11-01' }, '2026-11-02', SEM_ANEXO_IV);
  ok('admitido ontem → zero',       c2(novo.total), 0);

  // PJ não gera provisão nenhuma.
  ok('PJ não provisiona',           prov({ tipo: 'pj', salario: 3000, admissao: '2024-01-01' }, '2026-11-02', SEM_ANEXO_IV).total, 0);
  // Sem data de admissão não dá para estimar — e não se chuta.
  ok('sem admissão → zero',         prov({ tipo: 'clt', salario: MIN }, '2026-11-02', SEM_ANEXO_IV).total, 0);
}

console.log('\n=== 8) a folha inteira ===');
{
  const equipe = [
    { nome: 'A', tipo: 'clt', salario: MIN, admissao: '2026-03-01', ativo: true },
    { nome: 'B', tipo: 'clt', salario: 2200, admissao: '2025-06-01', ativo: true },
    { nome: 'C', tipo: 'pj', salario: 3000, ativo: true },
    { nome: 'D', tipo: 'clt', salario: MIN, admissao: '2024-01-01', ativo: false }, // desligado
  ];
  const t = totais(equipe, SEM_ANEXO_IV, '2026-11-02');
  ok('conta só quem está ativo',    t.pessoas, 3);
  ok('soma dos salários',           c2(t.salarios), c2(MIN + 2200 + 3000));
  ok('custo total da folha',        c2(t.total), c2(2153.05 + custo({ tipo: 'clt', salario: 2200 }, SEM_ANEXO_IV).total + 3000));
  // O PJ puxa o fator para BAIXO: R$ 3.000 sem encargo nenhum no meio da conta.
  ok('fator médio da equipe',       Number(t.fator.toFixed(3)), 1.184);
  ok('fator médio < fator do CLT',  t.fator < 1.3282, true);
  ok('provisão acumulada da equipe', t.provisaoAcum > 0, true);
  ok('equipe vazia não quebra',     totais([], SEM_ANEXO_IV, '2026-11-02').total, 0);
}

console.log('\n=== 9) não contar a folha duas vezes no DRE ===');
{
  // O botão "Usar no DRE" cria UMA linha chamada Folha (RH). Se as linhas antigas
  // de salário ficarem, o custo fixo dobra e o lucro do mês fica errado — e
  // errado para MENOS, que é o lado que ninguém estranha.
  vm.runInContext("const RH_FIXO_ID = 'rh-folha';\n" + trecho('rhConflitosFolha'), ctx);
  const conf = ctx.rhConflitosFolha;

  // Os custos fixos reais do Joey, em 02/11/2026.
  const REAIS = [
    { id: 1, name: 'Aluguel', value: 2606 },
    { id: 2, name: 'Água', value: 100 },
    { id: 3, name: 'Contador', value: 450 },
    { id: 4, name: 'IPTU', value: 100 },
    { id: 5, name: 'Salários', value: 4040 },
    { id: 6, name: 'Anotaí', value: 399 },
    { id: 7, name: 'Motoboys', value: 2520 },
    { id: 8, name: 'Celular', value: 30 },
    { id: 9, name: 'luz', value: 1400 },
  ];
  ok('pega Salários e Motoboys',      conf(REAIS).map((c) => c.name), ['Salários', 'Motoboys']);
  ok('não pega Aluguel nem Contador',  conf(REAIS).some((c) => /Aluguel|Contador|luz/.test(c.name)), false);
  ok('soma do que sairia',            conf(REAIS).reduce((a, c) => a + c.value, 0), 6560);

  // Variantes de escrita que o dono pode ter usado.
  ok('variantes de nome',             conf([
    { id: 1, name: 'salario da equipe', value: 1 },
    { id: 2, name: 'FOLHA DE PAGAMENTO', value: 1 },
    { id: 3, name: 'Funcionários', value: 1 },
    { id: 4, name: 'Entregadores', value: 1 },
    { id: 5, name: 'Pró-labore', value: 1 },
    { id: 6, name: 'Colaboradores', value: 1 },
  ]).length, 6);

  // A própria linha do RH nunca entra na lista de conflito — senão ela se
  // apagaria a cada clique.
  ok('a linha do RH se exclui',       conf([{ id: 'rh-folha', name: 'Folha (RH)', value: 8000 }]), []);
  ok('lista vazia não quebra',        conf([]), []);
  ok('sem lista não quebra',          conf(null), []);
  ok('nome ausente não quebra',       conf([{ id: 1, value: 10 }]), []);
}

console.log(`\n${falhas ? '❌' : '✅'}  ${total - falhas}/${total} passaram\n`);
process.exit(falhas ? 1 : 0);
