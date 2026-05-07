const { onRequest }  = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const axios = require('axios');
admin.initializeApp();
const db = admin.firestore();

// ── FOCUS NFe — EMISSÃO DE NFCe ──────────────────────────────────────────────

function mapFormaPagamento(pagamento) {
  const p = (pagamento || '').toLowerCase();
  if (p.includes('pix'))      return '17';
  if (p.includes('dinheiro')) return '01';
  if (p.includes('cr'))       return '03';
  if (p.includes('d') && p.includes('b')) return '04';
  return '99';
}

const CAT_DEFAULTS = {
  'pizza':  { ncm: '21069090', cest: '',        cfop: '5101', csosn: '102', cst_pis: '07', cst_cofins: '07', cclass_trib: '200047', ibs_estadual: 0.1, ibs_municipal: 0, cbs: 0.9 },
  'bebida': { ncm: '22089000', cest: '0300504', cfop: '5405', csosn: '500', cst_pis: '04', cst_cofins: '04', cclass_trib: '200047', ibs_estadual: 0.1, ibs_municipal: 0, cbs: 0.9 },
  'burger': { ncm: '21069090', cest: '',        cfop: '5101', csosn: '102', cst_pis: '07', cst_cofins: '07', cclass_trib: '200047', ibs_estadual: 0.1, ibs_municipal: 0, cbs: 0.9 },
  'lanche': { ncm: '21069090', cest: '',        cfop: '5101', csosn: '102', cst_pis: '07', cst_cofins: '07', cclass_trib: '200047', ibs_estadual: 0.1, ibs_municipal: 0, cbs: 0.9 },
  'porcao': { ncm: '21069090', cest: '',        cfop: '5101', csosn: '102', cst_pis: '07', cst_cofins: '07', cclass_trib: '200047', ibs_estadual: 0.1, ibs_municipal: 0, cbs: 0.9 },
  'outro':  { ncm: '21069090', cest: '',        cfop: '5101', csosn: '102', cst_pis: '07', cst_cofins: '07', cclass_trib: '200047', ibs_estadual: 0.1, ibs_municipal: 0, cbs: 0.9 },
};

function getTrib(categoria, catTrib) {
  const cat = (categoria || 'Outro').trim();
  if (catTrib[cat]) return catTrib[cat];
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');
  const catN = norm(cat);
  for (const [k, v] of Object.entries(catTrib)) {
    if (norm(k) === catN) return v;
  }
  if (CAT_DEFAULTS[catN]) return CAT_DEFAULTS[catN];
  for (const [k, v] of Object.entries(CAT_DEFAULTS)) {
    if (catN.includes(k) || k.includes(catN)) return v;
  }
  return { ncm: '21069090', cfop: '5102', csosn: '400' };
}

exports.emitirNFCe = onRequest(
  { invoker: 'public', region: 'us-central1', cors: true },
  async (req, res) => {
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, erro: 'Método não permitido' });
    }

    try {
      const { pedidoId, itens, total, pagamento, cpfCnpj, cliente } = req.body || {};

      if (!pedidoId || !Array.isArray(itens) || itens.length === 0) {
        return res.status(400).json({ ok: false, erro: 'pedidoId e itens são obrigatórios' });
      }

      // Lê config fiscal, categorias tributárias e NCM individuais do Firestore
      const [fiscalSnap, catTribSnap, ncmProdSnap] = await Promise.all([
        db.collection('config').doc('fiscal').get(),
        db.collection('config').doc('categoriasTributarias').get(),
        db.collection('config').doc('ncmProdutos').get(),
      ]);
      const fiscal    = fiscalSnap.exists    ? fiscalSnap.data()    : {};
      const catTrib   = catTribSnap.exists   ? catTribSnap.data()   : {};
      const ncmProdutos = ncmProdSnap.exists ? ncmProdSnap.data()   : {};

      const focusToken = (fiscal.apiKey || fiscal.tokenProducao || '').trim();

      if (!focusToken) {
        return res.status(400).json({
          ok: false,
          erro: 'Token da Focus NFe não configurado. Acesse Fiscal → Configuração.',
        });
      }

      const baseUrl = (fiscal.ambiente || fiscal.fAmbiente) === 'homologacao'
        ? 'https://homologacao.focusnfe.com.br'
        : 'https://api.focusnfe.com.br';

      const ref = `joey-${pedidoId}-${Date.now()}`;

      // Data/hora em horário de Brasília
      const dataEmissao = new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).replace(' ', 'T') + '-03:00';

      // Monta itens para o JSON da Focus NFe
      const items = itens.map((item, idx) => {
        const qty    = parseFloat(item.qty || item.quantidade || 1);
        const preco  = parseFloat(item.preco || item.price || 0);
        const trib   = getTrib(item.categoria || item.category, catTrib);
        // NCM individual do produto tem prioridade sobre o NCM da categoria
        const ncmInd = ncmProdutos[String(item.id)] || '';
        const ncmFinal = (ncmInd.length === 8 ? ncmInd : null) || trib.ncm;
        return {
          numero_item:              idx + 1,
          codigo_produto:           String(item.id || idx + 1).padStart(3, '0'),
          descricao:                String(item.nome || item.name || 'Produto').substring(0, 120),
          codigo_ncm:               ncmFinal,
          ...(trib.cest ? { codigo_cest: trib.cest } : {}),
          cfop:                     trib.cfop,
          unidade_comercial:        'UN',
          quantidade_comercial:     qty,
          valor_unitario_comercial: preco,
          valor_bruto:              parseFloat((preco * qty).toFixed(2)),
          icms_origem:              0,
          icms_situacao_tributaria: trib.csosn,
          pis_situacao_tributaria:  trib.cst_pis    || trib.pis    || '07',
          cofins_situacao_tributaria: trib.cst_cofins || trib.cofins || '07',
        };
      });

      const totalItens = parseFloat(items.reduce((s, i) => s + i.valor_bruto, 0).toFixed(2));
      const formaPag = mapFormaPagamento(pagamento);
      const pagObj = {
        forma_pagamento: formaPag,
        valor_pagamento: totalItens,
      };
      if (formaPag === '01' && req.body?.troco > 0) {
        pagObj.troco = parseFloat(req.body.troco.toFixed(2));
      }

      const nfcePayload = {
        natureza_operacao:           'Venda ao consumidor',
        data_emissao:                dataEmissao,
        tipo_documento:              1,
        finalidade_emissao:          1,
        consumidor_final:            1,
        presenca_comprador:          (req.body?.entrega === 'delivery') ? 2 : 1,
        modalidade_frete:            9,
        valor_frete:                 0,
        cnpj_emitente:               (fiscal.cnpj || '').replace(/\D/g, '') || undefined,
        inscricao_estadual_emitente: (fiscal.ie || '').trim() || undefined,
        telefone_emitente:           (fiscal.telefone || '').replace(/\D/g, '') || undefined,
        regime_tributario_emitente:  fiscal.regime === 'simples' ? 1 : fiscal.regime === 'presumido' ? 2 : fiscal.regime === 'real' ? 3 : 1,
        percentual_tributos_incidentes: fiscal.percTributos ? parseFloat(fiscal.percTributos) : undefined,
        informacoes_adicionais_contribuinte: (fiscal.msgRodape || '').trim() || undefined,
        csc:                         (fiscal.csc || '').trim() || undefined,
        csc_id:                      String(fiscal.idCsc || '').trim() || undefined,
        serie:                       fiscal.serieNfce || fiscal.serieNFCe || 2,
        items,
        formas_pagamento: [pagObj],
      };

      // Remove campos undefined para não poluir o JSON enviado
      Object.keys(nfcePayload).forEach(k => nfcePayload[k] === undefined && delete nfcePayload[k]);

      // CPF/CNPJ do consumidor (opcional)
      if (cpfCnpj) {
        const nums = cpfCnpj.replace(/\D/g, '');
        if (nums.length === 11)      nfcePayload.cpf_destinatario  = nums;
        else if (nums.length === 14) nfcePayload.cnpj_destinatario = nums;
      }

      // Envia para Focus NFe
      const focusResp = await axios.post(
        `${baseUrl}/v2/nfce?ref=${ref}`,
        nfcePayload,
        {
          auth:           { username: focusToken, password: '' },
          headers:        { 'Content-Type': 'application/json' },
          timeout:        30000,
          validateStatus: () => true,
        }
      );

      const focusData  = focusResp.data || {};
      const httpStatus = focusResp.status;

      const statusNota = focusData.status === 'autorizado'  ? 'emitida'
                       : focusData.status === 'processando' ? 'pendente'
                       : httpStatus >= 400                  ? 'erro'
                       :                                      'pendente';

      // Salva resultado no Firestore
      const agora2 = new Date();
      await db.collection('notasFiscais').doc(String(pedidoId)).set({
        pedidoId:     String(pedidoId),
        cliente:      cliente || null,
        total:        total   || 0,
        pagamento:    pagamento || null,
        cpfCnpj:      cpfCnpj   || null,
        focusRef:     ref,
        focusStatus:  focusData.status        || null,
        focusMsg:     focusData.mensagem_sefaz || focusData.mensagem || null,
        nf:           focusData.numero         || null,
        numeroNota:   focusData.numero         || null,
        chaveAcesso:  focusData.chave_nfe      || null,
        chaveNfe:     focusData.chave_nfe      || null,
        danfeUrl:     focusData.caminho_danfe
          ? `${baseUrl}${focusData.caminho_danfe}?token=${focusToken}`
          : null,
        status:       statusNota,
        data: agora2.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
        hora: agora2.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }),
        criadoEm: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      if (statusNota === 'emitida') {
        const danfeUrl = focusData.caminho_danfe
          ? `${baseUrl}${focusData.caminho_danfe}?token=${focusToken}`
          : null;
        console.log('[emitirNFCe] autorizado — caminho_danfe:', focusData.caminho_danfe, '| danfeUrl:', danfeUrl);
        return res.json({
          ok:        true,
          status:    statusNota,
          nf:        focusData.numero,
          numeroNota:focusData.numero,
          chaveNfe:  focusData.chave_nfe,
          mensagem:  focusData.mensagem_sefaz,
          danfe:     danfeUrl,
        });
      }

      const erroMsg = focusData.mensagem_sefaz
        || focusData.mensagem
        || (Array.isArray(focusData.erros) ? focusData.erros.map(e => e.mensagem).join('; ') : null)
        || `Erro HTTP ${httpStatus}`;

      console.error('[emitirNFCe] Focus NFe erro:', erroMsg, JSON.stringify(focusData));
      return res.status(422).json({ ok: false, erro: erroMsg, focusStatus: focusData.status });

    } catch (err) {
      console.error('[emitirNFCe] exceção:', err.message, err.response?.data);
      return res.status(500).json({ ok: false, erro: 'Erro interno: ' + err.message });
    }
  }
);

// ── FOCUS NFe — CANCELAMENTO DE NFCe ─────────────────────────────────────────

exports.cancelarNFCe = onRequest(
  { invoker: 'public', region: 'us-central1', cors: true },
  async (req, res) => {
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, erro: 'Método não permitido' });
    }
    try {
      const { pedidoId, ref, justificativa } = req.body || {};
      if (!pedidoId || !ref || !justificativa || String(justificativa).trim().length < 15) {
        return res.status(400).json({ ok: false, erro: 'pedidoId, ref e justificativa (mín. 15 caracteres) são obrigatórios' });
      }
      const fiscalSnap = await db.collection('config').doc('fiscal').get();
      const fiscal = fiscalSnap.exists ? fiscalSnap.data() : {};
      const focusToken = (fiscal.apiKey || fiscal.tokenProducao || '').trim();
      if (!focusToken) {
        return res.status(400).json({ ok: false, erro: 'Token da Focus NFe não configurado.' });
      }
      const just = justificativa.trim();
      const focusResp = await axios.delete(
        `https://api.focusnfe.com.br/v2/nfce/${encodeURIComponent(ref)}`,
        {
          data: { justificativa: just },
          auth: { username: focusToken, password: '' },
          headers: { 'Content-Type': 'application/json' },
          timeout: 30000,
          validateStatus: () => true,
        }
      );
      const focusData  = focusResp.data || {};
      const httpStatus = focusResp.status;
      if (httpStatus >= 200 && httpStatus < 300) {
        await db.collection('notasFiscais').doc(String(pedidoId)).set({
          status: 'cancelada',
          canceladoEm: admin.firestore.FieldValue.serverTimestamp(),
          justificativaCancelamento: just,
        }, { merge: true });
        return res.json({ ok: true, status: 'cancelada' });
      }
      const erroMsg = focusData.mensagem_sefaz
        || focusData.mensagem
        || (Array.isArray(focusData.erros) ? focusData.erros.map(e => e.mensagem).join('; ') : null)
        || `Erro HTTP ${httpStatus}`;
      console.error('[cancelarNFCe] Focus NFe erro:', erroMsg, JSON.stringify(focusData));
      return res.status(422).json({ ok: false, erro: erroMsg });
    } catch (err) {
      console.error('[cancelarNFCe] exceção:', err.message, err.response?.data);
      return res.status(500).json({ ok: false, erro: 'Erro interno: ' + err.message });
    }
  }
);

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

// ── BACKUP AUTOMÁTICO DO FIRESTORE ───────────────────────────────────────────
// Lê todas as coleções via Admin SDK e grava JSON no Cloud Storage.
// Não requer datastore.importExportAdmin — usa apenas as permissões do
// Firebase Admin SDK que a Cloud Function já possui por padrão.
// Destino: gs://<bucket>/firestore-backups/<timestamp>/backup.json
// Histórico salvo na coleção `backups`.

const BACKUP_PREFIX = 'firestore-backups';
const BACKUP_RETAIN_LOG = 90;

async function executarBackup(origem) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  const logRef = await db.collection('backups').add({
    iniciadoEm: admin.firestore.FieldValue.serverTimestamp(),
    stamp,
    origem,
    status: 'iniciado',
  });

  try {
    const collections = await db.listCollections();
    const backup = {};

    for (const colRef of collections) {
      const snap = await colRef.get();
      backup[colRef.id] = {};
      snap.forEach(doc => {
        // Converte Timestamp → ISO string para JSON serializable
        const data = doc.data();
        const clean = JSON.parse(JSON.stringify(data, (k, v) => {
          if (v && typeof v === 'object' && typeof v.toDate === 'function') {
            return v.toDate().toISOString();
          }
          return v;
        }));
        backup[colRef.id][doc.id] = clean;
      });
    }

    const totalColecoes = Object.keys(backup).length;
    const totalDocs = Object.values(backup).reduce((s, c) => s + Object.keys(c).length, 0);
    console.log(`[BACKUP] (${origem}) ${totalColecoes} coleções, ${totalDocs} docs → gravando JSON`);

    const bucket = admin.storage().bucket();
    const fileName = `${BACKUP_PREFIX}/${stamp}/backup.json`;
    const file = bucket.file(fileName);
    await file.save(JSON.stringify(backup, null, 2), {
      contentType: 'application/json',
      metadata: { origem, stamp, totalDocs: String(totalDocs) },
    });

    const gcsPath = `gs://${bucket.name}/${fileName}`;
    console.log(`[BACKUP] concluído: ${gcsPath}`);

    await logRef.update({
      gcsPath,
      totalColecoes,
      totalDocs,
      status: 'concluído',
      concluidoEm: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { ok: true, gcsPath, totalColecoes, totalDocs, logId: logRef.id };
  } catch (err) {
    console.error('[BACKUP] erro:', err.message);
    await logRef.update({ status: 'erro', erro: err.message });
    throw err;
  }
}

// Schedule diário às 03:00 horário de Brasília (baixa carga)
exports.backupFirestoreDaily = onSchedule(
  {
    schedule: '0 3 * * *',
    timeZone: 'America/Sao_Paulo',
    region: 'us-central1',
    timeoutSeconds: 540,
    memory: '256MiB',
  },
  async () => {
    try {
      await executarBackup('schedule');
    } catch (err) {
      console.error('[BACKUP DAILY] falhou:', err.message);
    }
    // Limpa logs antigos (>90 dias) — opcional
    try {
      const limite = Date.now() - BACKUP_RETAIN_LOG * 24 * 60 * 60 * 1000;
      const antigos = await db.collection('backups')
        .where('iniciadoEm', '<', new Date(limite))
        .limit(50)
        .get();
      const batch = db.batch();
      antigos.forEach(doc => batch.delete(doc.ref));
      if (!antigos.empty) await batch.commit();
    } catch (err) {
      console.warn('[BACKUP DAILY] limpeza de logs falhou:', err.message);
    }
  }
);

// Disparo manual via HTTP — exige token via header `x-backup-token`
// Defina o secret BACKUP_TRIGGER_TOKEN no Firebase Functions ou via gcloud
exports.backupFirestoreManual = onRequest(
  { invoker: 'public', region: 'us-central1', cors: true, timeoutSeconds: 540 },
  async (req, res) => {
    const expected = process.env.BACKUP_TRIGGER_TOKEN;
    const provided = req.headers['x-backup-token'];
    if (!expected) {
      return res.status(503).json({ ok: false, erro: 'BACKUP_TRIGGER_TOKEN não configurado' });
    }
    if (provided !== expected) {
      return res.status(401).json({ ok: false, erro: 'token inválido' });
    }
    try {
      const result = await executarBackup('manual');
      return res.json(result);
    } catch (err) {
      return res.status(500).json({ ok: false, erro: err.message });
    }
  }
);
