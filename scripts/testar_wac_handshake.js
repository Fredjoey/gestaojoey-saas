/**
 * TESTE — handshake do WhatsApp Cloud API (Embedded Signup) do painel.
 *
 * Não reimplementa a lógica: EXTRAI o bloco real do painel.html (de "WhatsApp Cloud API —
 * Embedded Signup (handshake completo)" até o fim de wacDesconectar) e roda num sandbox com
 * window/document/firebase/db/notify simulados + timers falsos. Assim dá pra provar, SEM a
 * Meta e SEM deploy, exatamente a máquina de estado que travava ("junta os 3 pedaços"):
 * ordem code↔FINISH, cancelamento, token-em-vez-de-code, diagnóstico que evita o texto
 * pendurado, e a tela do estado conectado (render/ver-dados/desconectar).
 *
 * Uso: node scripts/testar_wac_handshake.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'painel.html'), 'utf8');
let falhas = 0, testes = 0;
function ok(nome, cond, detalhe) {
  testes++; if (!cond) falhas++;
  console.log(`   ${cond ? '✅' : '❌'} ${nome}${detalhe ? '\n        ' + detalhe : ''}`);
}

const bloco = SRC.match(/\/\/ ── WhatsApp Cloud API — Embedded Signup \(handshake completo\)[\s\S]*?\nasync function wacDesconectar\(\) \{[\s\S]*?\n\}/);
if (!bloco) { console.error('❌ não achei o bloco do handshake WAC no painel.html'); process.exit(1); }

const esperar = ms => new Promise(r => setImmediate(r));   // drena microtasks das Promises mockadas

function montarCtx(opts) {
  opts = opts || {};
  // ---- timers falsos (controláveis) ----
  let _timers = [], _tid = 0;
  const fakeSetTimeout   = (fn, delay) => { const id = ++_tid; _timers.push({ id, fn, delay }); return id; };
  const fakeClearTimeout = (id) => { _timers = _timers.filter(t => t.id !== id); };
  const flushTimers      = () => { const due = _timers.splice(0); due.forEach(t => { try { t.fn(); } catch (_) {} }); };

  // ---- DOM falso (mapa plano de ids) ----
  const mkEl = () => ({ style: {}, innerHTML: '', textContent: '', disabled: false });
  const els = {
    cloudSignupMsg: mkEl(), btnCloudSignup: mkEl(),
    cloudConnectBox: mkEl(), cloudConnectedBox: mkEl(),
    cloudNumInfo: mkEl(), btnWacDados: mkEl(),
  };
  const document = { getElementById: (id) => els[id] || null };

  // ---- window: guarda o handler de 'message' + slot do FB ----
  let msgHandler = null;
  const location = { hostname: 'app.gestaojoey.com.br' };
  const fbLogin = { cb: null, params: null };
  const window = {
    addEventListener: (tipo, h) => { if (tipo === 'message') msgHandler = h; },
    location,
    FB: { login: (cb, params) => { fbLogin.cb = cb; fbLogin.params = params; } },
  };

  // ---- firebase callable + db mockados ----
  const chamadas = [];
  const respostas = Object.assign({
    trocarCodeWhatsApp:      { data: { ok: true, wabaId: 'WABA123', phoneNumberId: 'PN456', appAssinado: true } },
    detalhesNumeroWhatsApp:  { data: { ok: true, numero: { display_phone_number: '+55 22 99999-0000', verified_name: 'Joey Burger', quality_rating: 'GREEN', name_status: 'APPROVED', platform_type: 'CLOUD_API' } } },
    desconectarWhatsAppCloud:{ data: { ok: true } },
  }, opts.respostas || {});
  const firebase = { app: () => ({ functions: () => ({
    httpsCallable: (nome) => (payload) => {
      chamadas.push({ nome, payload });
      const r = respostas[nome];
      if (r instanceof Error) return Promise.reject(r);
      return Promise.resolve(r || { data: { ok: false } });
    },
  }) }) };
  let snapCb = null;
  const db = { doc: () => ({ onSnapshot: (cb) => { snapCb = cb; return () => {}; } }) };

  const notifies = [];
  const ctx = {
    window, document, location, firebase, db,
    slug: 'joey',
    notify: (msg, tipo) => notifies.push({ msg, tipo }),
    _esc: (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    confirm: () => (opts.confirm !== false),
    setTimeout: fakeSetTimeout, clearTimeout: fakeClearTimeout,
    console: { log: () => {}, warn: () => {}, error: () => {} },
    Promise, JSON, String, Number, Object, URL,
  };
  vm.createContext(ctx);
  vm.runInContext(bloco[0] + '\nthis.api = { wacIniciarSignup, renderCloudApiCard, _wacListenerConfig, wacVerDados, wacDesconectar, getSignup: () => _wacSignup, getEnviando: () => _wacEnviando };', ctx);

  return {
    ctx, els, chamadas, notifies, flushTimers,
    fireMsg: (event, data, origin) => msgHandler && msgHandler({ origin: origin || 'https://www.facebook.com', data: { type: 'WA_EMBEDDED_SIGNUP', event, data } }),
    fireLoginCode:  (code) => fbLogin.cb && fbLogin.cb({ authResponse: { code: code || 'CODE-abc' } }),
    fireLoginToken: ()     => fbLogin.cb && fbLogin.cb({ authResponse: { accessToken: 'TOKEN-xyz' } }),
    fireLoginNone:  ()     => fbLogin.cb && fbLogin.cb({}),
    fireSnap: (data) => snapCb && snapCb({ exists: !!data, data: () => data }),
    loginPronto: () => !!fbLogin.cb,
    loginParams: () => fbLogin.params,
  };
}

(async () => {
  console.log('\n══ 1. code → FINISH: conclui UMA vez, chama trocarCodeWhatsApp com os 3 dados ══\n');
  {
    const h = montarCtx();
    h.ctx.api.wacIniciarSignup(); await esperar();
    ok('popup abriu (FB.login registrou callback)', h.loginPronto());
    ok('extras pede sessionInfoVersion (SDK emite o FINISH)', (h.loginParams().extras || {}).sessionInfoVersion === '3');
    ok('botão desabilitado durante o fluxo', h.els.btnCloudSignup.disabled === true);
    h.fireLoginCode('CODE-1');                       // FB.login volta o code
    ok('só com o code ainda NÃO chamou o servidor (aguardando grace/FINISH)', h.chamadas.length === 0);
    ok('mensagem "finalizando no servidor" (não fica em "Abrindo…")', /finalizando no servidor/i.test(h.els.cloudSignupMsg.innerHTML));
    h.fireMsg('FINISH', { waba_id: 'W1', phone_number_id: 'P1', business_id: 'B1' }); await esperar(); await esperar();
    ok('chamou trocarCodeWhatsApp exatamente 1×', h.chamadas.filter(c => c.nome === 'trocarCodeWhatsApp').length === 1);
    ok('payload = {slug, code, waba_id, phone_number_id, business_id}', JSON.stringify(h.chamadas[0].payload) === JSON.stringify({ slug: 'joey', code: 'CODE-1', waba_id: 'W1', phone_number_id: 'P1', business_id: 'B1' }));
    ok('mensagem de sucesso na tela', /conectado via Cloud API/i.test(h.els.cloudSignupMsg.innerHTML) && h.els.cloudSignupMsg.style.color === '#34d399');
    ok('botão reabilitado ao fim', h.els.btnCloudSignup.disabled === false);
  }

  console.log('\n══ 2. FINISH → code (ordem invertida): também conclui ══\n');
  {
    const h = montarCtx();
    h.ctx.api.wacIniciarSignup(); await esperar();
    h.fireMsg('FINISH', { waba_id: 'W2', phone_number_id: 'P2' });   // número chega ANTES do login
    ok('só com o número ainda NÃO chamou o servidor', h.chamadas.length === 0);
    h.fireLoginCode('CODE-2'); await esperar(); await esperar();
    ok('chamou trocarCodeWhatsApp 1×', h.chamadas.filter(c => c.nome === 'trocarCodeWhatsApp').length === 1);
    ok('payload correto', h.chamadas[0].payload.code === 'CODE-2' && h.chamadas[0].payload.phone_number_id === 'P2');
  }

  console.log('\n══ 3. code SEM FINISH (Plano B): servidor recebe o code e deriva waba/phone ══\n');
  {
    const h = montarCtx();
    h.ctx.api.wacIniciarSignup(); await esperar();
    h.fireLoginCode('CODE-3');                        // popup fechou com login; FINISH nunca vem
    ok('mensagem "finalizando no servidor"', /finalizando no servidor/i.test(h.els.cloudSignupMsg.innerHTML));
    ok('ainda não chamou (aguardando o grace)', h.chamadas.length === 0);
    h.flushTimers();                                  // dispara o grace(1,5s) → conclui pelo servidor
    await esperar(); await esperar();
    ok('CHAMOU trocarCodeWhatsApp mesmo sem FINISH', h.chamadas.filter(c => c.nome === 'trocarCodeWhatsApp').length === 1);
    ok('payload leva code + waba/phone null (servidor deriva do token)', h.chamadas[0].payload.code === 'CODE-3' && h.chamadas[0].payload.waba_id === null && h.chamadas[0].payload.phone_number_id === null);
    ok('mensagem de sucesso na tela', /conectado via Cloud API/i.test(h.els.cloudSignupMsg.innerHTML));
    ok('não ficou preso enviando', h.ctx.api.getEnviando() === false);
  }

  console.log('\n══ 4. CANCEL e ERROR: mensagem clara, encerra, sem chamar o servidor ══\n');
  {
    const h = montarCtx();
    h.ctx.api.wacIniciarSignup(); await esperar();
    h.fireMsg('CANCEL', { current_step: 'PHONE_NUMBER' });
    ok('CANCEL → mensagem "cancelada"', /cancelada/i.test(h.els.cloudSignupMsg.innerHTML));
    ok('CANCEL → não chamou o servidor', h.chamadas.length === 0);
    ok('CANCEL → botão reabilitado', h.els.btnCloudSignup.disabled === false);
    const h2 = montarCtx();
    h2.ctx.api.wacIniciarSignup(); await esperar();
    h2.fireMsg('ERROR', { error_message: 'algo deu errado' });
    ok('ERROR → mostra a mensagem da Meta', /algo deu errado/i.test(h2.els.cloudSignupMsg.innerHTML));
  }

  console.log('\n══ 5. FB.login devolve TOKEN em vez de code: erro claro, sem chamar o servidor ══\n');
  {
    const h = montarCtx();
    h.ctx.api.wacIniciarSignup(); await esperar();
    h.fireLoginToken();
    ok('avisa sobre token vs code', /token.*em vez de.*c[oó]digo/i.test(h.els.cloudSignupMsg.innerHTML));
    ok('não chamou trocarCodeWhatsApp', h.chamadas.length === 0);
    ok('botão reabilitado', h.els.btnCloudSignup.disabled === false);
  }

  console.log('\n══ 6. Estado conectado: render mostra dados + botões; vazio mostra o botão ══\n');
  {
    const h = montarCtx();
    h.ctx.api.renderCloudApiCard();   // _wacConfig=null
    ok('sem config → mostra o botão (connectBox visível)', h.els.cloudConnectBox.style.display === '' && h.els.cloudConnectedBox.style.display === 'none');
    // simula o onSnapshot trazendo uma conta conectada
    h.ctx.api._wacListenerConfig();
    h.fireSnap({ ativo: true, phoneNumberId: 'PN456', wabaId: 'WABA123', businessId: 'BIZ789', displayPhoneNumber: '+55 22 99999-0000', verifiedName: 'Joey Burger', appAssinado: true, conectadoEm: { toDate: () => new Date('2026-07-23T12:00:00-03:00') } });
    const html = h.els.cloudConnectedBox.innerHTML;
    ok('conectado → connectBox some, connectedBox aparece', h.els.cloudConnectBox.style.display === 'none' && h.els.cloudConnectedBox.style.display === '');
    ok('mostra número, nome, WABA, business id, phone id', /99999-0000/.test(html) && /Joey Burger/.test(html) && /WABA123/.test(html) && /BIZ789/.test(html) && /PN456/.test(html));
    ok('tem botão Desconectar e Ver dados', /wacDesconectar\(\)/.test(html) && /wacVerDados\(\)/.test(html));
    ok('mostra "Conectado"', /Conectado/.test(html));
    // desconectar: a msg verde "conectado" NÃO pode ficar pendurada abaixo do botão
    h.els.cloudSignupMsg.innerHTML = '✅ WhatsApp conectado via Cloud API!';
    h.els.cloudSignupMsg.style.display = 'block';
    h.fireSnap(null);   // config sumiu (ativo:false / doc apagado) → volta pro estado inicial
    ok('desconectou → mostra o botão de novo', h.els.cloudConnectBox.style.display === '' && h.els.cloudConnectedBox.style.display === 'none');
    ok('desconectou → limpa a mensagem verde pendurada', h.els.cloudSignupMsg.innerHTML === '' && h.els.cloudSignupMsg.style.display === 'none');
  }

  console.log('\n══ 7. Ver dados na Meta (whatsapp_business_management) e Desconectar ══\n');
  {
    const h = montarCtx();
    await h.ctx.api.wacVerDados(); await esperar();
    ok('chamou detalhesNumeroWhatsApp com o slug', h.chamadas.some(c => c.nome === 'detalhesNumeroWhatsApp' && c.payload.slug === 'joey'));
    ok('exibiu os dados retornados na caixa', /99999-0000/.test(h.els.cloudNumInfo.textContent) && /GREEN/.test(h.els.cloudNumInfo.textContent));
    const h2 = montarCtx();
    await h2.ctx.api.wacDesconectar(); await esperar();
    ok('confirm=true → chamou desconectarWhatsAppCloud', h2.chamadas.some(c => c.nome === 'desconectarWhatsAppCloud'));
    ok('notificou a desconexão', h2.notifies.some(n => /desconectado/i.test(n.msg)));
    const h3 = montarCtx({ confirm: false });
    await h3.ctx.api.wacDesconectar(); await esperar();
    ok('confirm=false → NÃO chama o servidor', !h3.chamadas.some(c => c.nome === 'desconectarWhatsAppCloud'));
  }

  console.log('\n══ 8. Erro do servidor na troca: mensagem clara, não trava ══\n');
  {
    const h = montarCtx({ respostas: { trocarCodeWhatsApp: new Error('código expirado') } });
    h.ctx.api.wacIniciarSignup(); await esperar();
    h.fireLoginCode('CODE-8'); h.fireMsg('FINISH', { waba_id: 'W8', phone_number_id: 'P8' });
    await esperar(); await esperar();
    ok('mostra o erro do servidor', /expirado/i.test(h.els.cloudSignupMsg.innerHTML) && h.els.cloudSignupMsg.style.color === '#f87171');
    ok('botão reabilitado após o erro', h.els.btnCloudSignup.disabled === false);
    ok('não ficou travado enviando', h.ctx.api.getEnviando() === false);
  }

  console.log('\n' + '─'.repeat(64));
  console.log(`${falhas === 0 ? '✅ TODOS OS TESTES PASSARAM' : '❌ ' + falhas + ' FALHA(S)'} — ${testes - falhas}/${testes}`);
  process.exit(falhas === 0 ? 0 : 1);
})();
