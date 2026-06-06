const { GoogleAuth } = require('google-auth-library');

(async () => {
  const auth = new GoogleAuth({
    keyFile: './serviceAccount-gestaojoey.json',
    scopes: ['https://www.googleapis.com/auth/firebase'],
  });
  const client = await auth.getClient();
  const tokenObj = await client.getAccessToken();
  const token = tokenObj.token;

  // 1. Pega o release ativo
  const releaseUrl = 'https://firebaserules.googleapis.com/v1/projects/gestaojoey/releases/cloud.firestore';
  const releaseRes = await fetch(releaseUrl, { headers: { Authorization: `Bearer ${token}` } });
  const release = await releaseRes.json();
  console.log('=== RELEASE ATIVO ===');
  console.log(JSON.stringify(release, null, 2));

  // 2. Pega o source do ruleset
  if (release.rulesetName) {
    const rulesetUrl = `https://firebaserules.googleapis.com/v1/${release.rulesetName}`;
    const rulesetRes = await fetch(rulesetUrl, { headers: { Authorization: `Bearer ${token}` } });
    const ruleset = await rulesetRes.json();
    console.log('\n=== SOURCE EM PRODUÇÃO ===');
    if (ruleset.source && ruleset.source.files) {
      ruleset.source.files.forEach(f => {
        console.log(`\n--- ${f.name} ---`);
        console.log(f.content);
      });
    }
  }
})();
