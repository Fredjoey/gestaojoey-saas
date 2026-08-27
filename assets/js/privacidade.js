/* ============================================================
   Gestão Joey — Modo Privacidade
   Botão global que esconde os valores do painel.
   Uso: <script src="assets/js/privacidade.js" defer></script>
   ============================================================ */
(function () {
  'use strict';

  var KEY = 'joey_privacidade';
  var MOEDA = /R\$\s?-?\d/;
  var LIMITE_TEXTO = 60; // evita borrar parágrafos inteiros
  var ativo = localStorage.getItem(KEY) === '1';
  var pintando = false;

  /* ---------- estilo ---------- */
  var css = document.createElement('style');
  css.textContent = [
    '.joey-oculto{filter:blur(7px);user-select:none;pointer-events:none;transition:filter .15s}',
    'input.joey-oculto{filter:none;user-select:auto;pointer-events:auto;',
    '-webkit-text-security:disc;text-security:disc}',
    '@supports not (-webkit-text-security:disc){input.joey-oculto{filter:blur(5px);pointer-events:auto}}',
    'body.joey-espiando .joey-oculto{filter:none;-webkit-text-security:none;user-select:auto}',
    'input.joey-oculto:focus{-webkit-text-security:none;filter:none}',
    '#joeyPrivBtn{background:transparent;border:1px solid #E87722;color:#E87722;',
    'border-radius:6px;padding:6px 10px;font-size:13px;line-height:1;cursor:pointer;',
    'display:inline-flex;align-items:center;gap:6px;font-family:inherit}',
    '#joeyPrivBtn:hover{background:#E87722;color:#0f0f0f}',
    '#joeyPrivBtn:focus-visible{outline:2px solid #E87722;outline-offset:2px}',
    '#joeyPrivBtn.flutuante{position:fixed;top:14px;right:70px;z-index:9999;background:#141414}',
    '@media (prefers-reduced-motion:reduce){.joey-oculto{transition:none}}'
  ].join('');
  document.head.appendChild(css);

  /* ---------- marcação dos valores ---------- */
  function marcar(raiz) {
    var walker = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        return MOEDA.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    var alvos = [], no;
    while ((no = walker.nextNode())) {
      var el = no.parentElement;
      if (!el) continue;
      if (el.closest('[data-sem-privacidade]')) continue;
      if (el.id === 'joeyPrivBtn') continue;
      if (el.textContent.trim().length > LIMITE_TEXTO) continue;
      alvos.push(el);
    }
    // opt-in manual para valores sem "R$" (gráficos, contadores)
    Array.prototype.push.apply(alvos, raiz.querySelectorAll('[data-valor]'));

    // campos de digitação de dinheiro (lançamento de nota, precificação...)
    var CAMPOS = 'input[type="number"],input[inputmode="decimal"],input.money,input.valor';
    var NOME = /valor|preco|preço|total|custo|unit|desconto|frete|pago/i;
    var NAO = /qtd|qtde|quantidade|peso|estoque|cep|telefone|cnpj|cpf|nfe|numero|número/i;
    raiz.querySelectorAll('input').forEach(function (inp) {
      if (inp.closest('[data-sem-privacidade]')) return;
      var assinatura = (inp.name || '') + ' ' + (inp.id || '') + ' ' +
                       (inp.className || '') + ' ' + (inp.placeholder || '');
      if (NAO.test(assinatura) && !inp.hasAttribute('data-valor')) return;
      if (inp.matches(CAMPOS) || NOME.test(assinatura)) alvos.push(inp);
    });

    return alvos;
  }

  function aplicar() {
    pintando = true;
    var alvos = marcar(document.body);
    if (ativo) {
      alvos.forEach(function (el) { el.classList.add('joey-oculto'); });
    } else {
      document.querySelectorAll('.joey-oculto').forEach(function (el) {
        el.classList.remove('joey-oculto');
      });
    }
    atualizarBotao();
    // setTimeout em vez de requestAnimationFrame: aba em segundo plano nao roda rAF,
    // entao a flag ficava presa em true e o observer parava de pegar conteudo novo
    // ate a aba voltar a ser exibida. Timer roda mesmo com a aba oculta.
    setTimeout(function () { pintando = false; }, 0);
  }

  /* ---------- botão ---------- */
  var btn = document.createElement('button');
  btn.id = 'joeyPrivBtn';
  btn.type = 'button';

  function atualizarBotao() {
    btn.textContent = ativo ? '👁 Mostrar valores' : '🙈 Esconder valores';
    btn.setAttribute('aria-pressed', String(ativo));
    btn.title = ativo ? 'Mostrar os valores' : 'Esconder os valores da tela';
  }

  btn.addEventListener('click', function () {
    ativo = !ativo;
    localStorage.setItem(KEY, ativo ? '1' : '0');
    aplicar();
  });

  /* ---------- espiar (segurar botão ou Alt) ---------- */
  function espiar(liga) {
    if (!ativo) return;
    document.body.classList.toggle('joey-espiando', liga);
  }
  ['mousedown', 'touchstart'].forEach(function (ev) {
    btn.addEventListener(ev, function () { espiar(true); }, { passive: true });
  });
  ['mouseup', 'mouseleave', 'touchend', 'blur'].forEach(function (ev) {
    btn.addEventListener(ev, function () { espiar(false); });
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Alt') espiar(true); });
  document.addEventListener('keyup', function (e) { if (e.key === 'Alt') espiar(false); });
  window.addEventListener('blur', function () { espiar(false); });

  function montarBotao() {
    var slot = document.querySelector('[data-slot="privacidade"]');
    if (slot) { slot.appendChild(btn); return; }
    btn.classList.add('flutuante');
    document.body.appendChild(btn);
  }

  /* ---------- conteúdo dinâmico ---------- */
  var timer;
  var obs = new MutationObserver(function () {
    if (pintando || !ativo) return;
    clearTimeout(timer);
    timer = setTimeout(aplicar, 120);
  });

  function iniciar() {
    montarBotao();
    aplicar();
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }

  // API opcional: JoeyPrivacidade.esconder() / .mostrar() / .estado
  window.JoeyPrivacidade = {
    esconder: function () { ativo = true; localStorage.setItem(KEY, '1'); aplicar(); },
    mostrar: function () { ativo = false; localStorage.setItem(KEY, '0'); aplicar(); },
    get estado() { return ativo; }
  };
})();
