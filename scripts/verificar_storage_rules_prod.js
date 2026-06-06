const { GoogleAuth } = require('google-auth-library');

(async () => {
  const auth = new GoogleAuth({
    keyFile: './serviceAccount-gestaojoey.json',
    scopes: ['https://www.googleapis.com/auth/firebase'],
  });
  const client = await auth.getClient();
  const tokenObj = await client.getAccessToken();
  const token = tokenObj.token;

  // Release ativo do firebase.storage
  const releaseUrl = 'https://firebaserules.googleapis.com/v1/projects/gestaojoey/releases/firebase.storage';
  const releaseRes = await fetch(releaseUrl, { headers: { Authorization: `Bearer ${token}` } });
  const release = await releaseRes.json();
  console.log('=== RELEASE ATIVO (firebase.storage no gestaojoey) ===');
  console.log('updateTime:', release.updateTime);
  console.log('rulesetName:', release.rulesetName);

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
