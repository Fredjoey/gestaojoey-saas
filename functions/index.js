const { onRequest }  = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const axios = require('axios');

admin.initializeApp();
const db = admin.firestore();

const ZAPI_INSTANCE     = '3F23093AB48C02D2FF299E024201EAF7';
const ZAPI_TOKEN        = 'F1844E4F81266A7B25882914';
const ZAPI_CLIENT_TOKEN = 'F01b9a9a87d03458db9a16a29111a02e8S';
const ZAPI_BASE         = `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}`;
const ZAPI_HEADERS      = { 'Content-Type': 'application/json', 'Client-Token': ZAPI_CLIENT_TOKEN };

const ATENDIMENTO_HUMANO_MS = 10 * 60 * 1000;
const MSG_ATENDENTE = 'Aguarde um momento, em breve alguém irá te atender! 😊';

// In-memory config cache (30s TTL)
let configCache = null;
let configCacheAt = 0;
const CONFIG_TTL_MS = 30 * 1000;

async function getBotConfig() {
  if (configCache && (Date.now() - configCacheAt) < CONFIG_TTL_MS) return configCache;

  const [lojaSnap, botSnap] = await Promise.all([
    db.collection('config').doc('loja').get(),
    db.collection('botConfig').get(),
  ]);

  const loja = lojaSnap.exists ? lojaSnap.data() : {};
  const gatilhos = {};
  botSnap.forEach(doc => { gatilhos[doc.id] = doc.data(); });

  configCache = { botAtivo: loja.botAtivo !== false, gatilhos };
  configCacheAt = Date.now();
  return configCache;
}

function getSaudacaoHora() {
  const hora = new Date(Date.now() - 3 * 60 * 60 * 1000).getUTCHours();
  return hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
}

function buildResposta(template, nome) {
  const primeiroNome = (nome || '').split(' ')[0] || 'visitante';
  return template
    .replace(/\{saudacao\}/gi, getSaudacaoHora())
    .replace(/\{nome\}/gi, primeiroNome);
}

function matchGatilho(gatilhos, msgTexto) {
  for (const [id, cfg] of Object.entries(gatilhos)) {
    if (id === 'saudacao' || id === 'padrao') continue;
    const keywords = Array.isArray(cfg.keywords) ? cfg.keywords : [];
    for (const kw of keywords) {
      if (msgTexto.includes(kw.toLowerCase().trim())) return id;
    }
  }
  return null;
}

function msgBoasVindasFallback(nome) {
  const primeiroNome = (nome || '').split(' ')[0] || 'visitante';
  return `${getSaudacaoHora()}, ${primeiroNome}! Bem-vindo ao Joey! 🍕

Para fazer seu pedido acesse nosso cardápio:
👉 https://pedidos-joey.web.app/cardapio.html

Escolha seus produtos, informe seu endereço e finalize o pedido direto pelo link!

Dúvidas? Digite *atendente* para falar conosco.`;
}

async function enviarMensagem(phone, message) {
  const resp = await axios.post(
    `${ZAPI_BASE}/send-text`,
    { phone, message },
    { headers: ZAPI_HEADERS, timeout: 10000 }
  );
  return resp.data;
}

// ── WEBHOOK ──────────────────────────────────────────────────────────────────

exports.webhookWhatsApp = onRequest(
  { invoker: 'public', minInstances: 1, region: 'us-central1' },
  async (req, res) => {
    res.status(200).send('ok');

    try {
      const body = req.body || {};

      if (body.type !== 'ReceivedCallback') return;
      if (body.fromMe) return;
      if (body.isGroup || (body.phone || '').includes('@g.us')) return;

      const phone = body.phone || body.from || body.sender || body.chatId;
      if (!phone) return;

      const msgTexto = (body.text?.message || body.body || '').trim().toLowerCase();
      const agora    = Date.now();
      const nome     = body.senderName || '';
      const docRef   = db.collection('conversas').doc(phone);

      if (msgTexto === 'atendente') {
        await Promise.all([
          docRef.set({
            ultimaMensagem:    msgTexto,
            ultimoTimestamp:   agora,
            nomeContato:       nome,
            atendimento:       true,
            atendimentoExpira: agora + ATENDIMENTO_HUMANO_MS,
          }, { merge: true }),
          enviarMensagem(phone, MSG_ATENDENTE),
        ]);
        return;
      }

      const [cfg, doc] = await Promise.all([
        getBotConfig(),
        docRef.get(),
      ]);

      const dados = doc.exists ? doc.data() : {};

      if (dados.atendimento && (dados.atendimentoExpira || 0) > agora) {
        await docRef.set({
          ultimaMensagem:    body.text?.message || '',
          ultimoTimestamp:   agora,
          nomeContato:       nome || dados.nomeContato || '',
          atendimento:       true,
          atendimentoExpira: dados.atendimentoExpira,
        }, { merge: true });
        return;
      }

      if (!cfg.botAtivo) {
        await docRef.set({
          ultimaMensagem:  body.text?.message || '',
          ultimoTimestamp: agora,
          nomeContato:     nome || dados.nomeContato || '',
          atendimento:     false,
        }, { merge: true });
        return;
      }

      const matchId = matchGatilho(cfg.gatilhos, msgTexto);
      let resposta;

      if (matchId && cfg.gatilhos[matchId]?.resposta) {
        resposta = buildResposta(cfg.gatilhos[matchId].resposta, nome);
      } else {
        const template = cfg.gatilhos['saudacao']?.resposta || cfg.gatilhos['padrao']?.resposta;
        resposta = template ? buildResposta(template, nome) : msgBoasVindasFallback(nome);
      }

      await Promise.all([
        enviarMensagem(phone, resposta),
        docRef.set({
          ultimaMensagem:  body.text?.message || '',
          ultimoTimestamp: agora,
          nomeContato:     nome || dados.nomeContato || '',
          atendimento:     false,
        }, { merge: true }),
      ]);

    } catch (err) {
      const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
      console.error('[WEBHOOK] erro:', detail);
    }
  }
);

// ── MENSAGENS PROGRAMADAS ─────────────────────────────────────────────────────

exports.mensagensProgramadas = onSchedule(
  { schedule: 'every 1 minutes', timeZone: 'America/Sao_Paulo', region: 'us-central1' },
  async () => {
    // Calcular hora atual em Brasília (UTC-3)
    const brasiliaMs = Date.now() - 3 * 60 * 60 * 1000;
    const brDate     = new Date(brasiliaMs);
    const horaAtual  = `${String(brDate.getUTCHours()).padStart(2,'0')}:${String(brDate.getUTCMinutes()).padStart(2,'0')}`;
    const diasMap    = ['dom','seg','ter','qua','qui','sex','sab'];
    const diaAtual   = diasMap[brDate.getUTCDay()];

    const snap = await db.collection('mensagensProgramadas').where('ativo', '==', true).get();
    if (snap.empty) return;

    const jobs = [];
    snap.forEach(doc => {
      const d = doc.data();
      if (d.horario !== horaAtual) return;
      if (!Array.isArray(d.dias) || !d.dias.includes(diaAtual)) return;
      // Evita reenvio dentro de 23h
      if ((Date.now() - (d.ultimoEnvio || 0)) < 23 * 60 * 60 * 1000) return;
      jobs.push({ id: doc.id, data: d });
    });

    for (const job of jobs) {
      const { data } = job;
      try {
        const phones = [];
        if (data.destinatarios === 'numero' && data.numero) {
          phones.push(data.numero);
        } else {
          const convsSnap = await db.collection('conversas').limit(200).get();
          convsSnap.forEach(d => phones.push(d.id));
        }

        for (const phone of phones) {
          try { await enviarMensagem(phone, data.mensagem); }
          catch (e) { console.error('[SCHED] falha:', phone, e.message); }
          await new Promise(r => setTimeout(r, 300));
        }

        await db.doc('mensagensProgramadas/' + job.id).update({ ultimoEnvio: Date.now() });
        console.log('[SCHED]', data.nome, '— enviado para', phones.length, 'destinatário(s)');
      } catch (err) {
        console.error('[SCHED] erro:', data.nome, err.message);
      }
    }
  }
);
