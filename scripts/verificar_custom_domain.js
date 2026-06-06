const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert('./serviceAccount-gestaojoey.json') });

async function main() {
  const token = await admin.app().options.credential.getAccessToken();
  const url = `https://firebasehosting.googleapis.com/v1beta1/projects/gestaojoey/sites/gestaojoey-painel/customDomains/teste-final.gestaojoey.com.br`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token.access_token}` } });
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
  process.exit(0);
}
main().catch(e => console.error('❌', e));
