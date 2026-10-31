// TESTE — dois turnos no mesmo dia (almoço + noite).
//   node testes/horario-turnos.js      (hermético: nada de navegador, nada de Firestore)
//
// O caso: o Joey vai abrir no almoço. O cadastro de horário só aceitava UM intervalo por
// dia, então pôr 11:00–14:00 na quarta APAGAVA a noite. Agora cada dia guarda uma lista
// de turnos; `abre`/`fecha` continuam no documento espelhando o PRIMEIRO turno, de
// propósito, para que todo leitor que ainda não conhece `turnos` siga lendo o que lia.
//
// O que isto protege, na prática:
//   · às 15h, entre o almoço e a noite, a loja tem de aparecer FECHADA;
//   · e a próxima abertura tem de ser HOJE às 18h30 — não amanhã.
// Era exatamente aí que o código antigo erraria, porque só olhava um abre/fecha.

const fs = require('fs'), path = require('path'), vm = require('vm');

let falhas = 0, total = 0;
function ok(nome, real, esperado) {
  total++;
  const bate = JSON.stringify(real) === JSON.stringify(esperado);
  if (!bate) falhas++;
  console.log(`  ${bate ? 'OK   ' : 'FALHA'} ${String(nome).padEnd(56)} ${JSON.stringify(real)}${bate ? '' : `  ← esperado ${JSON.stringify(esperado)}`}`);
}

function carregar(arquivo) {
  const SRC = fs.readFileSync(path.join(__dirname, '..', arquivo), 'utf8');
  const trecho = (nome) => {
    const i = SRC.indexOf('function ' + nome + '(');
    if (i < 0) throw new Error(`${arquivo}: não achei ${nome}`);
    let d = 0;
    for (let k = SRC.indexOf('{', i); k < SRC.length; k++) {
      if (SRC[k] === '{') d++; else if (SRC[k] === '}') { d--; if (!d) return SRC.slice(i, k + 1); }
    }
  };
  // Pega um `const X = ...;` inteiro, seja de uma linha só ou de um bloco que
  // termina em `};` — contar chave a chave tropеçaria nas chaves das regex.
  const bloco = (nome) => {
    const i = SRC.indexOf('const ' + nome + ' = ');
    if (i < 0) throw new Error(`${arquivo}: não achei const ${nome}`);
    const linhas = SRC.slice(i).split('\n');
    if (/;\s*$/.test(linhas[0]) && !/\{\s*$/.test(linhas[0])) return linhas[0];
    let acc = '';
    for (const l of linhas) {
      acc += l + '\n';
      if (/^\};\s*$/.test(l)) return acc;
    }
    throw new Error(`${arquivo}: não achei o fim de ${nome}`);
  };
  return { SRC, trecho, bloco };
}

// Horário real do Joey a partir de novembro: almoço na quarta, noite todo dia de qua a dom.
// Quarta = 3. Guardado como o painel grava: turnos + abre/fecha espelhando o 1º turno.
const HORARIOS = {
  0: { ativo: true,  abre: '18:30', fecha: '23:00', turnos: [{ abre: '18:30', fecha: '23:00' }] },
  1: { ativo: false, abre: '18:30', fecha: '23:00', turnos: [{ abre: '18:30', fecha: '23:00' }] },
  2: { ativo: false, abre: '18:30', fecha: '23:00', turnos: [{ abre: '18:30', fecha: '23:00' }] },
  3: { ativo: true,  abre: '11:00', fecha: '14:00', turnos: [{ abre: '11:00', fecha: '14:00' }, { abre: '18:30', fecha: '23:00' }] },
  4: { ativo: true,  abre: '18:30', fecha: '23:00', turnos: [{ abre: '18:30', fecha: '23:00' }] },
  5: { ativo: true,  abre: '18:30', fecha: '23:00', turnos: [{ abre: '18:30', fecha: '23:00' }] },
  6: { ativo: true,  abre: '18:30', fecha: '23:00', turnos: [{ abre: '18:30', fecha: '23:00' }] },
};
// Formato VELHO, como está no Firestore hoje: sem o campo `turnos`.
const HORARIOS_VELHOS = {
  0: { ativo: true, abre: '18:30', fecha: '23:00' },
  3: { ativo: true, abre: '18:30', fecha: '23:00' },
  1: { ativo: false, abre: '18:30', fecha: '23:00' },
};

// Uma quarta-feira (2026-11-04 é quarta) na hora pedida, em horário de Brasília.
const quartaAs = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(2026, 10, 4, h, m, 0);
};

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n=== 1) painel.html — aberto/fechado com dois turnos ===');
{
  const { trecho } = carregar('painel.html');
  const ctx = { console, config: { aberto: true, horarios: HORARIOS }, _agoraBRT: () => quartaAs('12:00') };
  vm.createContext(ctx);
  vm.runInContext([trecho('_turnosDoDia'), trecho('_dentroDoTurno'), trecho('estaAberto')].join('\n'), ctx);

  const em = (hhmm) => { ctx._agoraBRT = () => quartaAs(hhmm); return ctx.estaAberto(); };

  ok('quarta 10:30 (antes do almoço) → fechada', em('10:30'), false);
  ok('quarta 12:00 (no almoço) → ABERTA',        em('12:00'), true);
  ok('quarta 13:59 (fim do almoço) → ABERTA',    em('13:59'), true);
  ok('quarta 14:00 (fechou o almoço) → fechada', em('14:00'), false);
  ok('quarta 15:00 (entre os turnos) → fechada', em('15:00'), false);
  ok('quarta 18:29 (um minuto antes) → fechada', em('18:29'), false);
  ok('quarta 18:30 (abriu a noite) → ABERTA',    em('18:30'), true);
  ok('quarta 22:30 → ABERTA',                    em('22:30'), true);
  ok('quarta 23:00 (fechou) → fechada',          em('23:00'), false);

  // O toggle manual do dono continua mandando em tudo.
  ctx.config = { aberto: false, horarios: HORARIOS };
  ok('dono marcou "fechado" às 12:00 → fechada', em('12:00'), false);
}

console.log('\n=== 2) painel.html — formato VELHO (sem `turnos`) segue funcionando ===');
{
  const { trecho } = carregar('painel.html');
  const ctx = { console, config: { aberto: true, horarios: HORARIOS_VELHOS }, _agoraBRT: () => quartaAs('20:00') };
  vm.createContext(ctx);
  vm.runInContext([trecho('_turnosDoDia'), trecho('_dentroDoTurno'), trecho('estaAberto')].join('\n'), ctx);
  const em = (hhmm) => { ctx._agoraBRT = () => quartaAs(hhmm); return ctx.estaAberto(); };

  ok('dia sem `turnos`, 20:00 → ABERTA',         em('20:00'), true);
  ok('dia sem `turnos`, 12:00 → fechada',        em('12:00'), false);
  ok('_turnosDoDia do formato velho',            ctx._turnosDoDia(HORARIOS_VELHOS[3]), [{ abre: '18:30', fecha: '23:00' }]);
  ok('dia desligado não devolve turno',          ctx._turnosDoDia(HORARIOS_VELHOS[1]), []);
  ok('dia inexistente não devolve turno',        ctx._turnosDoDia(undefined), []);
}

console.log('\n=== 3) painel.html — editar e salvar os turnos ===');
{
  const { trecho } = carregar('painel.html');
  const ctx = { console, config: { horarios: HORARIOS }, document: { getElementById: () => null } };
  vm.createContext(ctx);
  vm.runInContext([
    // var (e não let/const): só assim _horEdit fica visível no objeto de contexto do vm.
    'var _horEdit = {}; var MAX_TURNOS = 3; var DIAS_SEMANA = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];',
    trecho('_turnosDoDia'), trecho('_horDiaHtml'), trecho('_renderHorTodos'),
    trecho('renderHorariosDias'), trecho('toggleDia'), trecho('_horSetHora'),
    trecho('_horAddTurno'), trecho('_horRemTurno'), trecho('lerHorariosDias'),
  ].join('\n'), ctx);

  // Nada renderizado ainda: não pode devolver horário vazio e apagar o que está salvo.
  ok('sem abrir Configurações → devolve o salvo', ctx.lerHorariosDias()[3].turnos.length, 2);

  ctx.renderHorariosDias();
  ok('carregou os 2 turnos da quarta',            ctx.lerHorariosDias()[3].turnos, [{ abre: '11:00', fecha: '14:00' }, { abre: '18:30', fecha: '23:00' }]);
  ok('abre/fecha espelham o 1º turno',            [ctx.lerHorariosDias()[3].abre, ctx.lerHorariosDias()[3].fecha], ['11:00', '14:00']);
  ok('dia fechado continua fechado',              ctx.lerHorariosDias()[1].ativo, false);

  // Quinta só tem a noite; o dono adiciona o almoço.
  ctx._horAddTurno(4);
  ok('+ turno na quinta → vira o almoço',         ctx._horEdit[4].turnos, [{ abre: '11:00', fecha: '14:00' }, { abre: '18:30', fecha: '23:00' }]);
  ok('salvou ordenado por horário',               ctx.lerHorariosDias()[4].turnos, [{ abre: '11:00', fecha: '14:00' }, { abre: '18:30', fecha: '23:00' }]);
  ok('abre da quinta agora é o almoço',           ctx.lerHorariosDias()[4].abre, '11:00');

  // Editar a hora de um turno.
  ctx._horSetHora(4, 1, 'abre', '19:00');
  ok('editou o abre da noite de quinta',          ctx.lerHorariosDias()[4].turnos[1], { abre: '19:00', fecha: '23:00' });

  // Remover.
  ctx._horRemTurno(4, 1);
  ok('removeu o turno da noite',                  ctx.lerHorariosDias()[4].turnos, [{ abre: '11:00', fecha: '14:00' }]);
  ctx._horRemTurno(4, 0);
  ok('não dá pra remover o último turno',         ctx.lerHorariosDias()[4].turnos.length, 1);

  // Desligar o dia preserva o horário, pra não perder quando religar.
  ctx.toggleDia(3, false);
  ok('dia desligado guarda os turnos',            ctx.lerHorariosDias()[3].turnos.length, 2);
  ok('dia desligado fica ativo:false',            ctx.lerHorariosDias()[3].ativo, false);

  // Teto de turnos.
  ctx.toggleDia(5, true);
  ctx._horAddTurno(5); ctx._horAddTurno(5); ctx._horAddTurno(5); ctx._horAddTurno(5);
  ok('no máximo 3 turnos por dia',                ctx._horEdit[5].turnos.length, 3);
}

console.log('\n=== 4) cardapio.html — o que o cliente vê ===');
{
  const { trecho, bloco } = carregar('cardapio.html');
  const ctx = { console, CONFIG: { aberto: true, horarios: HORARIOS }, _agoraBRT: () => quartaAs('15:00') };
  vm.createContext(ctx);
  vm.runInContext([
    trecho('_turnosDoDia'), bloco('_hhmm'), trecho('_dentroDoTurno'),
    trecho('estaAberto'), bloco('_fmtH'), trecho('horarioHoje'), trecho('proximoAbertura'),
  ].join('\n'), ctx);
  const em = (hhmm) => { ctx._agoraBRT = () => quartaAs(hhmm); };

  em('15:00');
  ok('15:00 → fechada',                           ctx.estaAberto(), false);
  ok('15:00 → abre HOJE às 18h30',                ctx.proximoAbertura(), 'Loja fechada · Abre hoje às 18h30');
  em('09:00');
  ok('09:00 → abre hoje às 11h (o almoço)',       ctx.proximoAbertura(), 'Loja fechada · Abre hoje às 11h');
  em('23:30');
  ok('depois de fechar → abre amanhã às 18h30',   ctx.proximoAbertura(), 'Loja fechada · Abre amanhã às 18h30');

  em('12:00');
  ok('o cliente vê os dois turnos do dia',        ctx.horarioHoje(), '11h – 14h · 18h30 – 23h');
  em('12:00');
  ctx.CONFIG = { aberto: true, horarios: HORARIOS_VELHOS };
  ok('formato velho → um intervalo só',           ctx.horarioHoje(), '18h30 – 23h');
}

console.log(`\n${falhas ? '❌' : '✅'}  ${total - falhas}/${total} passaram\n`);
process.exit(falhas ? 1 : 0);
