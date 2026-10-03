// Une as conversas duplicadas do inbox: doc chaveado por LID (gravado até 03/07/2026, antes de o bot
// resolver LID → telefone) + doc chaveado pelo telefone, do MESMO contato. O painel listava os dois
// com o mesmo nome; quem abria o de LID via a conversa parada em junho ("abre numa data antiga e
// para" — Aline, Fernanda, Robson, Luana, Luh em 02/10).
//
//   node scripts/unir_conversas_lid.js              → SIMULAÇÃO (só lê; não grava nada)
//   node scripts/unir_conversas_lid.js --aplicar    → backup + une + apaga o doc de LID
//
// Par = doc de LID cujo telefone é conhecido por (a) um doc de telefone com jid "<lid>@lid" ou
// (b) clientes/joey/lidMap/<lid>. Fontes discordando → o par é PULADO e listado (nunca adivinha).
// Doc de LID sem gêmeo fica como está.
//
// --aplicar grava ANTES backup_conversas_lid_<ts>.json (os dois docs de cada par, inteiros; ignorado
// pelo git — tem conversa de cliente) e só então, par a par, numa TRANSAÇÃO: relê o doc do telefone,
// une as mensagens (sem repetir tipo+ts+texto), grava e apaga o de LID. Transação porque o bot grava
// no doc do telefone ao vivo: um set com o array lido antes perderia a mensagem que chegasse no meio.
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

admin.initializeApp({ credential: admin.credential.cert(path.resolve('./serviceAccount-gestaojoey.json')) });
const db = admin.firestore();
const SLUG = 'joey';
const APLICAR = process.argv.includes('--aplicar');
const col = (n) => db.collection(`clientes/${SLUG}/${n}`);

const ehTelefone = (id) => /^55\d{10,11}$/.test(id);
const chave = (m) => `${m.tipo}|${Number(m.ts) || 0}|${m.texto}`;
const dia = (ms) => (ms ? new Date(Number(ms) - 3 * 3600e3).toISOString().slice(0, 10) : '-');
const ultimo = (msgs) => Math.max(0, ...(msgs || []).map((m) => Number(m && m.ts) || 0));

function unir(msgsTel, msgsLid) {
  const vistos = new Set((msgsTel || []).map(chave));
  const novas = (msgsLid || []).filter((m) => m && !vistos.has(chave(m)) && vistos.add(chave(m)));
  const todas = [...(msgsTel || []), ...novas].sort((a, b) => (Number(a.ts) || 0) - (Number(b.ts) || 0));
  return { todas, novas: novas.length, repetidas: (msgsLid || []).length - novas.length };
}

async function main() {
  const [convSnap, lidSnap] = await Promise.all([col('conversas').get(), col('lidMap').get()]);
  const docs = new Map(convSnap.docs.map((d) => [d.id, d.data()]));
  const telPorJid = new Map();
  for (const [id, c] of docs) if (ehTelefone(id) && String(c.jid || '').endsWith('@lid')) telPorJid.set(String(c.jid).split('@')[0], id);
  const telPorMapa = new Map();
  for (const d of lidSnap.docs) {
    const x = d.data() || {};
    const t = String(x.telefone || x.numero || x.phone || x.pn || '').replace(/\D/g, '');
    if (t) telPorMapa.set(d.id.split('@')[0], t.startsWith('55') ? t : '55' + t);
  }

  const pares = [], conflitos = [], semGemeo = [];
  for (const [id, c] of docs) {
    if (ehTelefone(id)) continue;
    const porJid = telPorJid.get(id);
    const porMapa = telPorMapa.get(id);
    const alvo = porJid || porMapa;
    if (porJid && porMapa && porJid !== porMapa) { conflitos.push({ id, nome: c.nome, porJid, porMapa }); continue; }
    if (!alvo || !docs.has(alvo)) { semGemeo.push(id); continue; }
    const tel = docs.get(alvo);
    const u = unir(tel.mensagens, c.mensagens);
    pares.push({ lid: id, tel: alvo, nome: tel.nome || c.nome, fonte: porJid ? 'jid' : 'lidMap', ...u,
      msgsLid: (c.mensagens || []).length, ultLid: ultimo(c.mensagens), ultTel: ultimo(tel.mensagens) });
  }

  const ativos = pares.filter((p) => p.ultTel >= Date.parse('2026-09-01T03:00:00Z'));
  console.log(`${APLICAR ? 'APLICANDO' : 'SIMULAÇÃO (nada é gravado)'} — tenant ${SLUG}`);
  console.log(`conversas: ${docs.size} | pares LID→telefone: ${pares.length} (ativos desde set: ${ativos.length}) | LID sem gêmeo (ficam): ${semGemeo.length} | conflitos (pulados): ${conflitos.length}`);
  console.log(`mensagens movidas: ${pares.reduce((s, p) => s + p.novas, 0)} | já existentes no doc do telefone (não repetem): ${pares.reduce((s, p) => s + p.repetidas, 0)}`);
  console.log(`fonte do par: jid=${pares.filter((p) => p.fonte === 'jid').length} lidMap=${pares.filter((p) => p.fonte === 'lidMap').length}`);
  for (const c of conflitos) console.log(`  ⚠ CONFLITO ${c.id} (${c.nome}): jid→${c.porJid}, lidMap→${c.porMapa}`);
  const NOMES = /^(aline|fernanda|robson|luana|luh)\b/i;
  console.log('\nos 5 do relatório de 02/10:');
  for (const p of pares.filter((p) => NOMES.test(String(p.nome || '').trim()) && p.ultTel >= Date.parse('2026-10-02T03:00:00Z'))) {
    console.log(`  ${String(p.nome).padEnd(24)} LID ${p.lid} (${p.msgsLid} msgs, até ${dia(p.ultLid)}) → ${p.tel} (até ${dia(p.ultTel)}): +${p.novas} msgs, ${p.repetidas} repetidas`);
  }
  const posLid = pares.filter((p) => p.ultLid > p.ultTel);
  console.log(`\npares em que o doc de LID é MAIS RECENTE que o do telefone: ${posLid.length}${posLid.length ? ' ← conferir antes de aplicar' : ''}`);

  if (!APLICAR) { console.log('\nSimulação. Para gravar: node scripts/unir_conversas_lid.js --aplicar'); return; }

  const arq = `backup_conversas_lid_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  fs.writeFileSync(arq, JSON.stringify(pares.map((p) => ({ lid: p.lid, tel: p.tel, docLid: docs.get(p.lid), docTel: docs.get(p.tel) })), null, 1));
  console.log(`\nbackup: ${arq} (${pares.length} pares)`);

  let ok = 0, falhas = 0;
  for (const p of pares) {
    try {
      await db.runTransaction(async (tx) => {
        const refTel = col('conversas').doc(p.tel), refLid = col('conversas').doc(p.lid);
        const [sTel, sLid] = await Promise.all([tx.get(refTel), tx.get(refLid)]);
        if (!sTel.exists || !sLid.exists) throw new Error('doc sumiu desde a leitura');
        const tel = sTel.data() || {}, lid = sLid.data() || {};
        const u = unir(tel.mensagens, lid.mensagens);
        tx.update(refTel, { mensagens: u.todas, ...(!tel.nome && lid.nome ? { nome: lid.nome } : {}), lidUnidoEm: Date.now(), lidUnido: p.lid });
        tx.delete(refLid);
      });
      ok++;
    } catch (e) { falhas++; console.error(`  ✗ ${p.lid} → ${p.tel}: ${e.message}`); }
  }
  console.log(`unidos: ${ok} | falhas: ${falhas}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error('❌', e); process.exit(1); });
