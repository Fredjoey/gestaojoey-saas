// Importa clientes inativos do Anota AI para Firestore (coleção "clientes")
// Não sobrescreve documentos existentes
const admin = require('./functions/node_modules/firebase-admin');
const fs    = require('fs');

const serviceAccount = require('C:/Users/PC/Desktop/joeyapi/serviceAccount.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CSV_PATH = 'C:/Users/PC/Downloads/Clientes inativos - consulta gerada em 01_05_2026, 15_40_03.csv';
const BATCH_SIZE = 500;

function normalizarTel(t) {
  return (t || '').replace(/\D/g, '');
}

function gerarId(wpp, tel) {
  // Número Whatsapp já vem com 55; se não, adiciona 55 ao Número Telefone
  const wppDigits = normalizarTel(wpp);
  if (wppDigits.length >= 12) return wppDigits; // já tem código do país
  const telDigits = normalizarTel(tel);
  if (!telDigits) return null;
  return '55' + telDigits;
}

async function importar() {
  const raw = fs.readFileSync(CSV_PATH, 'utf8');
  const linhas = raw.split('\n').map(l => l.trim()).filter(Boolean);
  const header = linhas[0].split(',');

  // Mapeia índice de cada coluna pelo cabeçalho (tolerante a ordem)
  const idx = {};
  header.forEach((h, i) => { idx[h.trim()] = i; });

  const iNome  = idx['Nome do Cliente'];
  const iTel   = idx['Número Telefone'];
  const iWpp   = idx['Número Whatsapp'];
  const iQtd   = idx['Quantidade de Pedidos'];
  const iDias  = idx['Dias de Inatividade'];

  let ignorados = 0, jaExistiam = 0, importados = 0;
  const registros = [];

  for (let i = 1; i < linhas.length; i++) {
    // Divide respeitando vírgulas dentro de campos (sem aspas no CSV atual)
    const cols = linhas[i].split(',');

    const nome  = (cols[iNome]  || '').trim();
    const tel   = normalizarTel(cols[iTel]  || '');
    const wpp   = normalizarTel(cols[iWpp]  || '');
    const qtd   = parseInt(cols[iQtd]  || '0', 10) || 0;
    const dias  = parseInt(cols[iDias] || '0', 10) || 0;

    // Ignora "retirada" e telefones inválidos
    if (nome.toLowerCase() === 'retirada') { ignorados++; continue; }
    if (tel.length < 10 && wpp.length < 12) { ignorados++; continue; }

    const id = gerarId(wpp, tel);
    if (!id || id.length < 12) { ignorados++; continue; }

    registros.push({ id, nome, tel, wpp, qtd, dias });
  }

  console.log(`📋 ${registros.length} registros válidos | ${ignorados} ignorados`);

  // Verifica quais IDs já existem em lotes de 500 (getAll aceita até ~500 refs)
  const jaExistentes = new Set();
  for (let i = 0; i < registros.length; i += 500) {
    const slice = registros.slice(i, i + 500);
    const refs  = slice.map(r => db.collection('clientes').doc(r.id));
    const snaps = await db.getAll(...refs);
    snaps.forEach(snap => { if (snap.exists) jaExistentes.add(snap.id); });
  }

  jaExistiam = jaExistentes.size;
  console.log(`ℹ️  ${jaExistiam} já existiam no Firestore (não serão sobrescritos)`);

  const novos = registros.filter(r => !jaExistentes.has(r.id));
  console.log(`➕ ${novos.length} novos a importar`);

  if (novos.length === 0) {
    console.log('✅ Nada a importar.');
    process.exit(0);
  }

  const totalLotes = Math.ceil(novos.length / BATCH_SIZE);

  for (let i = 0; i < totalLotes; i++) {
    const lote = novos.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
    const batch = db.batch();

    for (const r of lote) {
      const ref = db.collection('clientes').doc(r.id);
      batch.set(ref, {
        nome:          r.nome,
        telefone:      r.tel,
        whatsapp:      r.id,          // id já normalizado com 55
        totalPedidos:  r.qtd,
        diasInatividade: r.dias,
        origem:        'anota_ai',
        status:        'inativo',
      });
    }

    await batch.commit();
    importados += lote.length;
    console.log(`  Lote ${i + 1}/${totalLotes} — ${importados}/${novos.length} importados`);
  }

  console.log(`\n✅ Importação concluída: ${importados} clientes salvos.`);
  console.log(`   Ignorados: ${ignorados} | Já existiam: ${jaExistiam}`);
  process.exit(0);
}

importar().catch(err => {
  console.error('❌ Erro:', err.message);
  process.exit(1);
});
