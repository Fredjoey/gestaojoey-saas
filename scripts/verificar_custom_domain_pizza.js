const fs = require('fs');
const { GoogleAuth } = require('google-auth-library');

(async () => {
  const auth = new GoogleAuth({
    keyFile: './serviceAccount-gestaojoey.json',
    scopes: ['https://www.googleapis.com/auth/firebase'],
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();

  const url = 'https://firebasehosting.googleapis.com/v1beta1/projects/gestaojoey/sites/gestaojoey-painel/customDomains/pizza-teste.gestaojoey.com.br';

  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token.token}` }
  });

  const data = await res.json();
  console.log('Status HTTP:', res.status);
  console.log(JSON.stringify(data, null, 2));
})();
