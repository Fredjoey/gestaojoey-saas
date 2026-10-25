// TESTE — corrida de recálculo na aba Análise (gestao-joey.html, updateAnalysis).
//   node testes/analise-corrida.js      (hermético: simula a corrida, sem navegador)
//
// O caso: 25/10/2026, 00h15. O Fred abriu a Análise, clicou em "Mês anterior" e a tela
// mostrou faturamento de R$ 2.259.142,18 — o histórico de 6 anos — com o botão de setembro
// aceso. Setembro foi R$ 41.896,00. Ele ia pensar em compras do mês em cima disso.
//
// Não era exceção: o Claude in Chrome rodou tudo e não achou erro nenhum. Era CORRIDA.
// updateAnalysis() é chamada por dois listeners do Firestore (onSnapshot de `recipes` e de
// `historicoFaturamento`) além do clique. Um recálculo que COMEÇOU com o período antigo pode
// TERMINAR depois do recálculo do clique e pintar a tela por cima.
//
// Este teste simula exatamente isso: um recálculo lento com o período velho e um rápido com o
// novo, e confere quem fica na tela no fim.

let falhas = 0, total = 0;
function ok(nome, real, esperado) {
  total++;
  const bate = JSON.stringify(real) === JSON.stringify(esperado);
  if (!bate) falhas++;
  console.log(`  ${bate ? 'OK   ' : 'FALHA'} ${String(nome).padEnd(58)} ${JSON.stringify(real)}${bate ? '' : `  ← esperado ${JSON.stringify(esperado)}`}`);
}
const dormir = ms => new Promise(r => setTimeout(r, ms));

// Dados reais do banco, em 25/10/2026.
const DADOS = { todos: 2259142.18, mesAnt: 41896.00 };

// ── A tela ──────────────────────────────────────────────────────────────────
function criarTela() { return { faturamento: null, rotulo: null }; }

// ── Versão ANTIGA (sem trava): pinta sempre, mesmo chegando atrasada ────────
function fabricarAntiga(tela, estado) {
  return async function updateAnalysis(atraso) {
    const periodo = estado.periodo;          // lê o período no início
    await dormir(atraso);                    // busca os 4.120 pedidos...
    tela.faturamento = DADOS[periodo];       // ...e pinta, sem conferir nada
    tela.rotulo = periodo === 'todos' ? 'Todos os relatórios' : '01 set → 30 set';
  };
}

// ── Versão NOVA (com trava de geração) ──────────────────────────────────────
function fabricarNova(tela, estado) {
  let run = 0;
  return async function updateAnalysis(atraso) {
    const meuRun = ++run;
    const periodo = estado.periodo;
    await dormir(atraso);
    if (meuRun !== run) return;              // chegou atrasado: desiste calado
    tela.faturamento = DADOS[periodo];
    tela.rotulo = periodo === 'todos' ? 'Todos os relatórios' : '01 set → 30 set';
  };
}

// Encena o 00h15: listener começa com "todos" e demora; o clique entra depois e é rápido.
async function encenar(fabricar) {
  const tela = criarTela();
  const estado = { periodo: 'todos' };
  const upd = fabricar(tela, estado);

  const b = upd(120);          // listener do Firestore — lento, período "todos"
  await dormir(10);
  estado.periodo = 'mesAnt';   // o clique troca o período (o botão acende aqui)
  const a = upd(20);           // recálculo do clique — rápido, período setembro
  await Promise.all([a, b]);
  return tela;
}

(async () => {
  console.log('\n=== 1) Código ANTIGO: o atrasado pinta por cima (o bug do Fred) ===');
  {
    const tela = await encenar(fabricarAntiga);
    ok('tela ficou com o histórico inteiro', tela.faturamento, 2259142.18);
    ok('rótulo "Todos", igual ao print dele', tela.rotulo, 'Todos os relatórios');
    ok('⚠️ NÃO mostrou setembro', tela.faturamento === DADOS.mesAnt, false);
  }

  console.log('\n=== 2) Código NOVO: o atrasado desiste ===');
  {
    const tela = await encenar(fabricarNova);
    ok('tela ficou com SETEMBRO', tela.faturamento, 41896.00);
    ok('rótulo do período certo', tela.rotulo, '01 set → 30 set');
  }

  console.log('\n=== 3) Novo: ordem normal (sem corrida) segue funcionando ===');
  {
    const tela = criarTela();
    const estado = { periodo: 'todos' };
    const upd = fabricarNova(tela, estado);
    await upd(5);
    ok('pinta "todos" quando é o único', tela.faturamento, 2259142.18);
    estado.periodo = 'mesAnt';
    await upd(5);
    ok('troca para setembro no clique', tela.faturamento, 41896.00);
  }

  console.log('\n=== 4) Novo: três recálculos empilhados, vence o ÚLTIMO ===');
  {
    const tela = criarTela();
    const estado = { periodo: 'todos' };
    const upd = fabricarNova(tela, estado);
    const p1 = upd(90), p2 = upd(60);
    await dormir(5);
    estado.periodo = 'mesAnt';
    const p3 = upd(10);
    await Promise.all([p1, p2, p3]);
    ok('vence o último (setembro)', tela.faturamento, 41896.00);
  }

  console.log(`\n${falhas ? '✖' : '✔'} ${total - falhas}/${total}\n`);
  process.exit(falhas ? 1 : 0);
})();
