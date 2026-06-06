const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert('./serviceAccount-gestaojoey.json') });

async function main() {
  const user = await admin.auth().getUserByEmail('pizzaria-teste@gestaojoey.com.br');
  await admin.auth().deleteUser(user.uid);
  console.log(`✅ Auth deletado: ${user.uid}`);
  process.exit(0);
}
main().catch(e => { console.error('❌', e); process.exit(1); });
