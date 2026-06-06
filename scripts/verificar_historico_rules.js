const { GoogleAuth } = require('google-auth-library');

(async () => {
  const auth = new GoogleAuth({
    keyFile: './serviceAccount-gestaojoey.json',
    scopes: ['https://www.googleapis.com/auth/firebase'],
  });
  const client = await auth.getClient();
  const tokenObj = await client.getAccessToken();
  const token = tokenObj.token;

  // 1. Release ativo
  const releaseUrl = 'https://firebaserules.googleapis.com/v1/projects/gestaojoey/releases/cloud.firestore';
  const releaseRes = await fetch(releaseUrl, { headers: { Authorization: `Bearer ${token}` } });
  const release = await releaseRes.json();
  console.log('=== RELEASE ATIVO ===');
  console.log('updateTime:', release.updateTime);
  console.log('rulesetName:', release.rulesetName);

  // 2. Source do ruleset atual
  if (release.rulesetName) {
    const rulesetUrl = `https://firebaserules.googleapis.com/v1/${release.rulesetName}`;
    const rulesetRes = await fetch(rulesetUrl, { headers: { Authorization: `Bearer ${token}` } });
    const ruleset = await rulesetRes.json();
    console.log('\n=== SOURCE EM PRODUÇÃO AGORA ===');
    if (ruleset.source && ruleset.source.files) {
      ruleset.source.files.forEach(f => {
        console.log(`\n--- ${f.name} ---`);
        console.log(f.content);
      });
    }
  }

  // 3. Lista últimos 10 rulesets (para ver histórico)
  const listUrl = 'https://firebaserules.googleapis.com/v1/projects/gestaojoey/rulesets?pageSize=10';
  const listRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${token}` } });
  const list = await listRes.json();
  console.log('\n=== HISTÓRICO (últimos 10 rulesets) ===');
  if (list.rulesets) {
    list.rulesets.forEach(r => {
      console.log(`${r.createTime} | ${r.name}`);
    });
  }
})();
