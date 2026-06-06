const admin = require('firebase-admin');
const path = require('path');

admin.initializeApp({
  credential: admin.credential.cert(path.resolve('./serviceAccount-gestaojoey.json'))
});

async function trocarEmail(emailAntigo, emailNovo) {
  const user = await admin.auth().getUserByEmail(emailAntigo);
  await admin.auth().updateUser(user.uid, { email: emailNovo, emailVerified: true });
  console.log(`✅ ${emailAntigo} → ${emailNovo}`);
}

async function main() {
  try { await trocarEmail('fred@joey.com', 'fred@joey.app.br'); } catch (e) { console.log('ℹ️ fred:', e.code || e.message); }
  try { await trocarEmail('bella@joey.com', 'isabela@joey.app.br'); } catch (e) { console.log('ℹ️ bella:', e.code || e.message); }

  const fred = await admin.auth().getUserByEmail('fred@joey.app.br');
  const isabela = await admin.auth().getUserByEmail('isabela@joey.app.br');
  await admin.auth().revokeRefreshTokens(fred.uid);
  await admin.auth().revokeRefreshTokens(isabela.uid);
  console.log('✅ Sessões revogadas');

  console.log('🎉 E-mails atualizados!');
  process.exit(0);
}

main().catch(e => { console.error('❌', e); process.exit(1); });
