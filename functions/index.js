const { onRequest }  = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const axios = require('axios');
const JSZip = require('jszip');
admin.initializeApp();
const db = admin.firestore();
const gestaoApp = admin.initializeApp(
  { credential: admin.credential.cert(require('./serviceAccount-gestaojoey.json')) },
  'gestao'
);
const dbGestao = gestaoApp.firestore();
const GESTAO_BUCKET = 'gestaojoey.firebasestorage.app';   // Storage do gestaojoey (XMLs das NFC-e)

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
        dbGestao.doc('clientes/joey/config/fiscal').get(),
        dbGestao.doc('clientes/joey/config/categoriasTributarias').get(),
        dbGestao.doc('clientes/joey/config/ncmProdutos').get(),
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
        presenca_comprador:          1,
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
      await dbGestao.collection('clientes/joey/notasFiscais').doc(String(pedidoId)).set({
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
        // Salva o XML no Cloud Storage (resiliente — NÃO quebra a emissão; cai no fallback no download)
        try {
          const cxml = focusData.caminho_xml_nota_fiscal || focusData.caminho_xml;
          if (cxml) {
            const xr = await axios.get(`${baseUrl}${cxml}`, { auth: { username: focusToken, password: '' }, timeout: 25000, responseType: 'text', validateStatus: () => true });
            if (xr.status < 400 && xr.data) {
              const xmlStr = typeof xr.data === 'string' ? xr.data : String(xr.data);
              const xmlStoragePath = await _fnSalvarXmlStorage('joey', ref, xmlStr);
              await dbGestao.collection('clientes/joey/notasFiscais').doc(String(pedidoId)).set({ xmlStoragePath }, { merge: true });
              console.log('[emitirNFCe] XML salvo no Storage:', xmlStoragePath);
            }
          }
        } catch (e) { console.warn('[emitirNFCe] XML->Storage falhou (cai no fallback no download):', e.message); }
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
      const fiscalSnap = await dbGestao.doc('clientes/joey/config/fiscal').get();
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
        await dbGestao.collection('clientes/joey/notasFiscais').doc(String(pedidoId)).set({
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

// ── BACKUP AUTOMÁTICO DO FIRESTORE ───────────────────────────────────────────
// Lê todas as coleções via Admin SDK e grava JSON no Cloud Storage.
// Não requer datastore.importExportAdmin — usa apenas as permissões do
// Firebase Admin SDK que a Cloud Function já possui por padrão.
// Destino: gs://<bucket>/firestore-backups/<timestamp>/backup.json
// Histórico salvo na coleção `backups`.

const BACKUP_PREFIX = 'firestore-backups';
const BACKUP_RETAIN_LOG = 90;

// Converte Timestamp do Firestore → ISO string para serialização JSON.
function cleanData(data) {
  return JSON.parse(JSON.stringify(data, (k, v) => {
    if (v && typeof v === 'object' && typeof v.toDate === 'function') {
      return v.toDate().toISOString();
    }
    return v;
  }));
}

// Snapshot recursivo de uma coleção: cada doc traz { _data, _subcollections? }.
// Processa docs em chunks paralelos de 50 para limitar concorrência mas acelerar
// as chamadas de listCollections() (gargalo em coleções com milhares de docs).
async function dumpCollection(colRef) {
  const snap = await colRef.get();
  const out = {};
  const docs = snap.docs;
  const CHUNK = 50;

  for (let i = 0; i < docs.length; i += CHUNK) {
    const chunk = docs.slice(i, i + CHUNK);
    await Promise.all(chunk.map(async (doc) => {
      const docOut = { _data: cleanData(doc.data()) };
      const subs = await doc.ref.listCollections();
      if (subs.length > 0) {
        docOut._subcollections = {};
        for (const sub of subs) {
          docOut._subcollections[sub.id] = await dumpCollection(sub);
        }
      }
      out[doc.id] = docOut;
    }));
  }

  return out;
}

// Itera root collections de um Firestore (instância) e dump recursivo.
async function snapshotProjeto(firestore) {
  const collections = await firestore.listCollections();
  const out = {};
  for (const colRef of collections) {
    out[colRef.id] = await dumpCollection(colRef);
  }
  return out;
}

// Conta documentos recursivamente no snapshot (entradas com chave _data).
function countDocs(node) {
  if (!node || typeof node !== 'object') return 0;
  let count = 0;
  for (const value of Object.values(node)) {
    if (value && typeof value === 'object') {
      if ('_data' in value) {
        count++;
        if (value._subcollections) count += countDocs(value._subcollections);
      } else {
        count += countDocs(value);
      }
    }
  }
  return count;
}

async function executarBackup(origem) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  const logRef = await db.collection('backups').add({
    iniciadoEm: admin.firestore.FieldValue.serverTimestamp(),
    stamp,
    origem,
    status: 'iniciado',
  });

  try {
    const [legacy, gestao] = await Promise.all([
      snapshotProjeto(db),
      snapshotProjeto(dbGestao),
    ]);

    const totalDocsLegacy = countDocs(legacy);
    const totalDocsGestao = countDocs(gestao);
    const totalDocs = totalDocsLegacy + totalDocsGestao;

    console.log(`[BACKUP] (${origem}) legacy=${totalDocsLegacy} docs, gestao=${totalDocsGestao} docs → gravando JSON`);

    const bucket = admin.storage().bucket();
    const fileName = `${BACKUP_PREFIX}/${stamp}/backup.json`;
    const file = bucket.file(fileName);
    await file.save(JSON.stringify({ legacy, gestao }, null, 2), {
      contentType: 'application/json',
      metadata: {
        origem,
        stamp,
        totalDocs: String(totalDocs),
        totalDocsLegacy: String(totalDocsLegacy),
        totalDocsGestao: String(totalDocsGestao),
      },
    });

    const gcsPath = `gs://${bucket.name}/${fileName}`;
    console.log(`[BACKUP] concluído: ${gcsPath}`);

    await logRef.update({
      gcsPath,
      totalDocs,
      totalDocsLegacy,
      totalDocsGestao,
      status: 'concluído',
      concluidoEm: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { ok: true, gcsPath, totalDocs, totalDocsLegacy, totalDocsGestao, logId: logRef.id };
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
    memory: '2GiB',
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

// ── CARRINHO ABANDONADO (N1: WhatsApp após 7min) ─────────────────────────────
// Roda a cada 2 minutos. Itera tenants em `clientes/` do projeto gestaojoey,
// busca carrinhos com status='pendente' criados há mais de 7min, envia mensagem
// via joeyapi e marca como 'mensagem_enviada'. Carrinhos com >24h sem conversão
// viram 'expirado'. Carrinhos já 'mensagem_enviada' ou 'convertido' são ignorados
// pelo where('status','==','pendente').

const CARRINHO_RECOVERY_DELAY_MS = 7  * 60 * 1000;
const CARRINHO_EXPIRA_MS         = 24 * 60 * 60 * 1000;

function joeyApiBaseFor(slug) {
  return slug === 'joey'
    ? 'https://joeyapi-production.up.railway.app'
    : `https://joeyapi-${slug}-production.up.railway.app`;
}

function cardapioUrlFor(slug) {
  // /l = rota de OG dinâmico (só no domínio compartilhado). joey vive no domínio legado → sem /l.
  return slug === 'joey'
    ? 'https://hamburgueriajoey.com.br'
    : `https://${slug}.gestaojoey.com.br/l`;
}

exports.verificarCarrinhosAbandonados = onSchedule(
  { schedule: 'every 2 minutes', timeZone: 'America/Sao_Paulo', region: 'us-central1' },
  async () => {
    const agora = Date.now();
    const limiteRecovery = new Date(agora - CARRINHO_RECOVERY_DELAY_MS);
    const limiteExpiraMs = agora - CARRINHO_EXPIRA_MS;

    const clientesRefs = await dbGestao.collection('clientes').listDocuments();

    for (const clienteRef of clientesRefs) {
      const slug = clienteRef.id;

      const carrinhosSnap = await clienteRef.collection('carrinhos')
        .where('status', '==', 'pendente')
        .where('criadoEm', '<', limiteRecovery)
        .get();

      if (carrinhosSnap.empty) continue;

      const [lojaSnap, botCfgSnap] = await Promise.all([
        clienteRef.collection('config').doc('loja').get(),
        clienteRef.collection('botConfig').doc('carrinhoAbandonado').get(),
      ]);
      const loja = lojaSnap.exists ? lojaSnap.data() : {};
      const nomeLoja = loja.nome || slug;
      const cardapioUrl = cardapioUrlFor(slug);
      const apiBase = joeyApiBaseFor(slug);

      // Template configurável: 1) botConfig/carrinhoAbandonado.resposta (gravado pelo painel),
      // 2) loja.botMensagens?.carrinhoAbandonado (fallback alternativo), 3) hardcoded.
      let template = botCfgSnap.exists ? String(botCfgSnap.data().resposta || '').trim() : '';
      if (!template && loja.botMensagens && loja.botMensagens.carrinhoAbandonado) {
        template = String(loja.botMensagens.carrinhoAbandonado).trim();
      }

      for (const carrinhoDoc of carrinhosSnap.docs) {
        const carrinho = carrinhoDoc.data();
        const criadoMs = carrinho.criadoEm?.toMillis?.() || 0;

        // Expirou (>24h sem conversão)? marca e pula
        if (criadoMs && criadoMs < limiteExpiraMs) {
          await carrinhoDoc.ref.update({ status: 'expirado' });
          console.log(`[CARRINHO N1] ${slug}/${carrinhoDoc.id} → expirado`);
          continue;
        }

        const tel = (carrinho.tel || '').replace(/\D/g, '');
        if (!tel) continue;
        const nome = (carrinho.nome || '').split(' ')[0] || 'cliente';

        const mensagem = template
          ? template
              .replace(/\{nome\}/gi, nome)
              .replace(/\{loja\}/gi, nomeLoja)
              .replace(/\{link\}/gi, cardapioUrl)
          : `Oi ${nome}! 👋 Você montou um pedido aqui na ${nomeLoja} mas não finalizou. Ainda quer? 🛒 Acesse: ${cardapioUrl}`;

        try {
          await axios.post(`${apiBase}/send`, { numero: tel, mensagem }, { timeout: 10000 });
          await carrinhoDoc.ref.update({
            status: 'mensagem_enviada',
            mensagemEnviadaEm: admin.firestore.FieldValue.serverTimestamp(),
          });
          console.log(`[CARRINHO N1] ${slug}/${carrinhoDoc.id} → enviado`);
        } catch (err) {
          console.warn(`[CARRINHO N1] ${slug}/${carrinhoDoc.id} erro:`, err.message);
        }
      }
    }
  }
);

// ── FOCUS NFe — DOWNLOAD DE XML (individual e ZIP do período) ─────────────────
// Por slug. Reusa o token Focus da config fiscal do tenant. Verifica o dono pelo
// token gestaojoey (gestaoApp.auth). Consulta a Focus por ref p/ obter o caminho_xml.

function _fnNfceCors(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
}

async function _fnVerificarDono(req, slug) {
  const m = String(req.headers.authorization || '').match(/^Bearer (.+)$/);
  if (!m) return { ok: false, code: 401, erro: 'Faça login no painel.' };
  let dec;
  try { dec = await gestaoApp.auth().verifyIdToken(m[1]); }
  catch (e) { return { ok: false, code: 401, erro: 'Sessão inválida. Recarregue e tente de novo.' }; }
  const email = dec.email || '';
  if (email === 'fred@joey.app.br' || email === 'isabela@joey.app.br') return { ok: true };
  const cli = await dbGestao.doc(`clientes/${slug}`).get();
  if (cli.exists && cli.data().authUid === dec.uid) return { ok: true };
  return { ok: false, code: 403, erro: 'Sem permissão para este estabelecimento.' };
}

async function _fnFocusCtx(slug) {
  const fs = await dbGestao.doc(`clientes/${slug}/config/fiscal`).get();
  const f = fs.exists ? (fs.data() || {}) : {};
  const token = (f.apiKey || f.tokenProducao || '').trim();
  const amb = f.ambiente || f.fAmbiente || 'producao';
  const baseUrl = amb === 'homologacao' ? 'https://homologacao.focusnfe.com.br' : 'https://api.focusnfe.com.br';
  return { token, baseUrl };
}

function _fnParseBR(s) {
  if (!s) return null;
  const p = String(s).split('/');
  return p.length === 3 ? new Date(+p[2], +p[1] - 1, +p[0]) : null;
}

// Consulta a Focus por ref, pega caminho_xml e baixa o XML (string). Lança em falha.
async function _fnBaixarXml(baseUrl, token, ref) {
  const meta = await axios.get(`${baseUrl}/v2/nfce/${encodeURIComponent(ref)}`, {
    auth: { username: token, password: '' }, timeout: 25000, validateStatus: () => true,
  });
  if (meta.status >= 400) throw new Error(`consulta ref HTTP ${meta.status}`);
  const path = meta.data && (meta.data.caminho_xml_nota_fiscal || meta.data.caminho_xml);
  if (!path) throw new Error(`sem caminho_xml (status ${meta.data && meta.data.status})`);
  const x = await axios.get(`${baseUrl}${path}`, {
    auth: { username: token, password: '' }, timeout: 25000, responseType: 'text', validateStatus: () => true,
  });
  if (x.status >= 400) throw new Error(`download xml HTTP ${x.status}`);
  return typeof x.data === 'string' ? x.data : String(x.data);
}

// Consulta a Focus por ref, pega caminho_danfe e baixa o DANFE (HTML do cupom). Lança em falha.
async function _fnBaixarDanfe(baseUrl, token, ref) {
  const meta = await axios.get(`${baseUrl}/v2/nfce/${encodeURIComponent(ref)}`, {
    auth: { username: token, password: '' }, timeout: 25000, validateStatus: () => true,
  });
  if (meta.status >= 400) throw new Error(`consulta ref HTTP ${meta.status}`);
  const path = meta.data && meta.data.caminho_danfe;
  if (!path) throw new Error(`sem caminho_danfe (status ${meta.data && meta.data.status})`);
  const d = await axios.get(`${baseUrl}${path}`, {
    auth: { username: token, password: '' }, timeout: 25000, responseType: 'text', validateStatus: () => true,
  });
  if (d.status >= 400) throw new Error(`download danfe HTTP ${d.status}`);
  return typeof d.data === 'string' ? d.data : String(d.data);
}

// Storage do gestaojoey: salva/le o XML em clientes/{slug}/xmls/{ref}.xml
async function _fnSalvarXmlStorage(slug, ref, xml) {
  const path = `clientes/${slug}/xmls/${ref}.xml`;
  await gestaoApp.storage().bucket(GESTAO_BUCKET).file(path).save(Buffer.from(xml, 'utf8'), {
    contentType: 'application/xml; charset=utf-8', resumable: false,
  });
  return path;
}
async function _fnLerXmlStorage(path) {
  const [buf] = await gestaoApp.storage().bucket(GESTAO_BUCKET).file(path).download();
  return buf.toString('utf8');
}

// Obtém o XML: 1º do Storage (xmlStoragePath, instantâneo); senão consulta a Focus por
// ref e salva no Storage de quebra (vira rápida na próxima). 'nota' = dados do doc.
async function _fnObterXml(slug, nota, baseUrl, token) {
  if (nota && nota.xmlStoragePath) {
    try { return await _fnLerXmlStorage(nota.xmlStoragePath); }
    catch (e) { console.warn('[xml] Storage falhou, fallback Focus:', e.message); }
  }
  const ref = nota && (nota.focusRef || nota.ref);
  if (!ref) throw new Error('sem ref nem xmlStoragePath');
  const xml = await _fnBaixarXml(baseUrl, token, ref);
  // bônus: salva no Storage p/ a próxima vez (best-effort — não falha o download)
  try {
    const path = await _fnSalvarXmlStorage(slug, ref, xml);
    if (nota && nota.pedidoId != null) {
      await dbGestao.doc(`clientes/${slug}/notasFiscais/${nota.pedidoId}`).set({ xmlStoragePath: path }, { merge: true });
    }
  } catch (e) { /* só otimização — ignora */ }
  return xml;
}

// XML individual — POST { slug, pedidoId } ou { slug, ref }
exports.nfceXml = onRequest({ invoker: 'public', region: 'us-central1' }, async (req, res) => {
  _fnNfceCors(res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, erro: 'Método não permitido' });
  try {
    const { slug, pedidoId, ref } = req.body || {};
    if (!slug || (!pedidoId && !ref)) return res.status(400).json({ ok: false, erro: 'slug e (pedidoId ou ref) são obrigatórios' });
    const dono = await _fnVerificarDono(req, slug);
    if (!dono.ok) return res.status(dono.code).json({ ok: false, erro: dono.erro });
    const { token, baseUrl } = await _fnFocusCtx(slug);
    if (!token) return res.status(400).json({ ok: false, erro: 'Token da Focus NFe não configurado.' });
    let nota = null, numero = null;
    if (pedidoId) {
      const nd = await dbGestao.doc(`clientes/${slug}/notasFiscais/${pedidoId}`).get();
      if (!nd.exists) return res.status(404).json({ ok: false, erro: 'Nota não encontrada.' });
      nota = nd.data();
      numero = nota.numeroNota || nota.nf;
      if (!(nota.focusRef || nota.ref || nota.xmlStoragePath)) return res.status(404).json({ ok: false, erro: 'Nota sem referência Focus.' });
    } else {
      nota = { focusRef: ref };  // ref direto, sem doc → só Focus
    }
    const xml = await _fnObterXml(slug, nota, baseUrl, token);
    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="NFCe-${numero || pedidoId || ref || 'nota'}.xml"`);
    return res.status(200).send(xml);
  } catch (err) {
    console.error('[nfceXml]', err.message);
    return res.status(500).json({ ok: false, erro: 'Erro ao baixar XML: ' + err.message });
  }
});

// DANFE (HTML do cupom, pra imprimir) — POST { slug, pedidoId } ou { slug, ref }.
// Proxy server-side: busca o DANFE na Focus com o token do tenant (contorna o CORS
// da Focus e mantém o token no servidor) e devolve o HTML com CORS liberado.
exports.nfceDanfe = onRequest({ invoker: 'public', region: 'us-central1' }, async (req, res) => {
  _fnNfceCors(res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, erro: 'Método não permitido' });
  try {
    const { slug, pedidoId, ref } = req.body || {};
    if (!slug || (!pedidoId && !ref)) return res.status(400).json({ ok: false, erro: 'slug e (pedidoId ou ref) são obrigatórios' });
    const dono = await _fnVerificarDono(req, slug);
    if (!dono.ok) return res.status(dono.code).json({ ok: false, erro: dono.erro });
    const { token, baseUrl } = await _fnFocusCtx(slug);
    if (!token) return res.status(400).json({ ok: false, erro: 'Token da Focus NFe não configurado.' });
    let focusRef = ref;
    if (!focusRef && pedidoId) {
      const nd = await dbGestao.doc(`clientes/${slug}/notasFiscais/${pedidoId}`).get();
      if (!nd.exists) return res.status(404).json({ ok: false, erro: 'Nota não encontrada.' });
      const nota = nd.data();
      focusRef = nota.focusRef || nota.ref;
      if (!focusRef) return res.status(404).json({ ok: false, erro: 'Nota sem referência Focus.' });
    }
    const html = await _fnBaixarDanfe(baseUrl, token, focusRef);
    res.set('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);
  } catch (err) {
    console.error('[nfceDanfe]', err.message);
    return res.status(500).json({ ok: false, erro: 'Erro ao obter DANFE: ' + err.message });
  }
});

// ZIP dos XMLs do período — POST { slug, de:'yyyy-mm-dd', ate:'yyyy-mm-dd' }
exports.nfceXmlZip = onRequest({ invoker: 'public', region: 'us-central1', timeoutSeconds: 540, memory: '512MiB' }, async (req, res) => {
  _fnNfceCors(res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, erro: 'Método não permitido' });
  try {
    const { slug, de, ate } = req.body || {};
    if (!slug || !de || !ate) return res.status(400).json({ ok: false, erro: 'slug, de e ate são obrigatórios' });
    const dono = await _fnVerificarDono(req, slug);
    if (!dono.ok) return res.status(dono.code).json({ ok: false, erro: dono.erro });
    const { token, baseUrl } = await _fnFocusCtx(slug);
    if (!token) return res.status(400).json({ ok: false, erro: 'Token da Focus NFe não configurado.' });
    const deD = new Date(de + 'T00:00:00'), ateD = new Date(ate + 'T23:59:59');
    const snap = await dbGestao.collection(`clientes/${slug}/notasFiscais`).get();
    const notas = snap.docs.map(d => d.data()).filter(n => {
      if (n.status !== 'emitida' && n.status !== 'cancelada') return false;
      if (!(n.focusRef || n.ref || n.xmlStoragePath)) return false;
      const d = _fnParseBR(n.data);
      return d && d >= deD && d <= ateD;
    });
    if (!notas.length) return res.status(404).json({ ok: false, erro: 'Nenhuma NFC-e emitida/cancelada no período.' });
    const zip = new JSZip();
    const erros = [];
    let okCount = 0;
    // baixa em lotes de 5 (não trava o ZIP se algum XML faltar)
    for (let i = 0; i < notas.length; i += 5) {
      const lote = notas.slice(i, i + 5);
      await Promise.all(lote.map(async (n) => {
        const ref = n.focusRef || n.ref;
        try {
          const xml = await _fnObterXml(slug, n, baseUrl, token);   // Storage 1º; fallback Focus + salva
          const tag = n.status === 'cancelada' ? '-CANCELADA' : '';
          zip.file(`NFCe-${n.numeroNota || n.nf || ref}-pedido-${n.pedidoId || ''}${tag}.xml`, xml);
          okCount++;
        } catch (e) {
          erros.push(`ref ${ref} (pedido ${n.pedidoId || '?'}, nota ${n.numeroNota || n.nf || '?'}): ${e.message}`);
        }
      }));
    }
    if (erros.length) zip.file('_xmls_nao_baixados.txt', `Não foi possível baixar ${erros.length} XML(s):\n\n` + erros.join('\n'));
    if (okCount === 0) return res.status(502).json({ ok: false, erro: 'Nenhum XML pôde ser baixado da Focus NFe.', detalhes: erros.slice(0, 5) });
    const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    res.set('Content-Type', 'application/zip');
    res.set('Content-Disposition', `attachment; filename="NFCe-${slug}-${de}_a_${ate}.zip"`);
    return res.status(200).send(buf);
  } catch (err) {
    console.error('[nfceXmlZip]', err.message);
    return res.status(500).json({ ok: false, erro: 'Erro ao gerar ZIP: ' + err.message });
  }
});
