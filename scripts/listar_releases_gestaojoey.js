const { GoogleAuth } = require('google-auth-library');

(async () => {
  const auth = new GoogleAuth({
    keyFile: './serviceAccount-gestaojoey.json',
    scopes: ['https://www.googleapis.com/auth/firebase'],
  });
  const client = await auth.getClient();
  const tokenObj = await client.getAccessToken();
  const token = tokenObj.token;

  // Lista todos os releases do projeto
  const url = 'https://firebaserules.googleapis.com/v1/projects/gestaojoey/releases';
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  console.log('=== TODOS OS RELEASES NO PROJETO gestaojoey ===');
  console.log(JSON.stringify(data, null, 2));
})();
