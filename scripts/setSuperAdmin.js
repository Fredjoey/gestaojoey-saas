/**
 * SUPER ADMIN — concede o custom claim { superAdmin: true } a um usuário do Firebase Auth
 * (projeto gestaojoey). É esse claim que o painel.html e as firestore.rules leem para liberar
 * o MODO SUPORTE (abrir o painel de qualquer tenant sem a senha do cliente).
 *
 * Uso:
 *   node scripts/setSuperAdmin.js                        # fred@joey.app.br (default)
 *   node scripts/setSuperAdmin.js outro@joey.app.br      # outro usuário
 *   node scripts/setSuperAdmin.js fred@joey.app.br --off # REVOGA o claim
 *
 * Credencial (nesta ordem):
 *   1) env GOOGLE_APPLICATION_CREDENTIALS  → caminho do service account JSON
 *   2) env JOEY_SA_DIR                     → diretório onde procurar o JSON do gestaojoey
 *   3) primeiro candidato conhecido que existir no disco (ver CANDIDATOS)
 * O arquivo de credencial NUNCA é versionado — aqui só existem CAMINHOS, nenhum segredo.
 *
 * ATENÇÃO — o token em cache NÃO muda sozinho: depois de rodar isto, o usuário precisa
 * fazer logout/login no painel (ou o app chamar getIdToken(true)) para o claim aparecer no JWT.
 */
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const EMAIL_DEFAULT = 'fred@joey.app.br';
const PROJETO_ESPERADO = 'gestaojoey';

// Locais onde o service account do gestaojoey costuma estar nesta máquina. Só caminhos.
const CANDIDATOS = [
  process.env.GOOGLE_APPLICATION_CREDENTIALS,
  ...(process.env.JOEY_SA_DIR ? [
    path.join(process.env.JOEY_SA_DIR, 'gestaojoey-firebase-adminsdk-fbsvc-793c780f34.json'),
    path.join(process.env.JOEY_SA_DIR, 'serviceAccount-gestaojoey.json'),
  ] : []),
  'G:/Meu Drive/Joey - Segurança Gestão/gestaojoey-firebase-adminsdk-fbsvc-793c780f34.json',
  './serviceAccount-gestaojoey.json',
].filter(Boolean);

function resolverCredencial() {
  for (const p of CANDIDATOS) {
    try { if (fs.existsSync(p)) return p; } catch (_) { /* caminho inválido → próximo */ }
  }
  console.error('ERRO: service account não encontrado. Procurei em:');
  CANDIDATOS.forEach((p) => console.error('  - ' + p));
  console.error('\nDefina o caminho com:  set GOOGLE_APPLICATION_CREDENTIALS=<caminho do json>');
  process.exit(1);
}

(async () => {
  const args = process.argv.slice(2);
  const revogar = args.includes('--off');
  const email = (args.find((a) => !a.startsWith('--')) || EMAIL_DEFAULT).trim().toLowerCase();

  const credPath = resolverCredencial();
  const sa = JSON.parse(fs.readFileSync(credPath, 'utf8'));
  if (sa.project_id !== PROJETO_ESPERADO) {
    console.error(`ERRO: essa credencial é do projeto "${sa.project_id}", esperado "${PROJETO_ESPERADO}".`);
    console.error('O claim precisa ser gravado no projeto onde o painel autentica.');
    process.exit(1);
  }
  admin.initializeApp({ credential: admin.credential.cert(sa) });
  console.log(`projeto: ${sa.project_id}\ncredencial: ${credPath}\n`);

  let user;
  try {
    user = await admin.auth().getUserByEmail(email);
  } catch (e) {
    console.error(`ERRO: usuário "${email}" não existe no Auth do ${sa.project_id} (${e.code || e.message}).`);
    process.exit(1);
  }

  const antes = user.customClaims || {};
  console.log(`usuário: ${email}`);
  console.log(`uid:     ${user.uid}`);
  console.log(`claims antes: ${JSON.stringify(antes)}`);

  // MERGE, nunca substituição: setCustomUserClaims sobrescreve o objeto inteiro, então
  // preservamos os claims que já existiam (ex.: slug/role do App Garçom).
  const depois = Object.assign({}, antes);
  if (revogar) delete depois.superAdmin;
  else depois.superAdmin = true;

  if (JSON.stringify(antes) === JSON.stringify(depois)) {
    console.log(`\nnada a fazer — superAdmin já está ${revogar ? 'ausente' : 'true'}.`);
    process.exit(0);
  }

  await admin.auth().setCustomUserClaims(user.uid, depois);
  const conf = await admin.auth().getUser(user.uid);
  console.log(`claims depois: ${JSON.stringify(conf.customClaims || {})}`);
  console.log(`\n${revogar ? 'REVOGADO' : 'CONCEDIDO'}: superAdmin ${revogar ? 'removido de' : 'em'} ${email} (uid ${user.uid})`);
  console.log('\nO JWT em cache continua o ANTIGO. Faça logout/login no painel para o claim valer.');
  process.exit(0);
})().catch((e) => { console.error('FALHOU:', e); process.exit(1); });
