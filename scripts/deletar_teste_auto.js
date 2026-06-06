const admin = require('firebase-admin');
const { GoogleAuth } = require('google-auth-library');

admin.initializeApp({ credential: admin.credential.cert('./serviceAccount-gestaojoey.json') });
const db = admin.firestore();

const PROJECT_ID = 'gestaojoey';
const HOSTING_SITE = 'gestaojoey-painel';
const SUBDOMAIN = 'teste-auto.gestaojoey.com.br';
const EMAIL = 'teste-auto@gestaojoey.com.br';

const googleAuth = new GoogleAuth({
  keyFile: './serviceAccount-gestaojoey.json',
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});

async function fhDeleteCustomDomain(domain) {
  const client = await googleAuth.getClient();
  const { token } = await client.getAccessToken();
  const url = `https://firebasehosting.googleapis.com/v1beta1/projects/${PROJECT_ID}/sites/${HOSTING_SITE}/customDomains/${encodeURIComponent(domain)}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { 'Authorization': 'Bearer ' + token },
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  console.log(`✅ Custom domain ${domain} (status ${res.status === 404 ? 'já não existia' : res.status})`);
}

async function main() {
  // 1) Auth
  try {
    const user = await admin.auth().getUserByEmail(EMAIL);
    await admin.auth().deleteUser(user.uid);
    console.log('✅ Usuário Auth deletado');
  } catch (e) {
    console.log('ℹ️ Usuário Auth:', e.code || e.message);
  }

  // 2) Firestore (recursivo: pega clientes/teste-auto + subcoleções)
  try {
    await db.recursiveDelete(db.doc('clientes/teste-auto'));
    console.log('✅ Firestore (clientes/teste-auto + subcoleções) deletado');
  } catch (e) {
    console.log('ℹ️ Firestore:', e.message);
  }

  // 3) Firebase Hosting custom domain
  try {
    await fhDeleteCustomDomain(SUBDOMAIN);
  } catch (e) {
    console.log('⚠️ Custom domain:', e.message);
  }

  console.log('🎉 teste-auto deletado!');
  process.exit(0);
}

main().catch(e => { console.error('❌', e); process.exit(1); });
