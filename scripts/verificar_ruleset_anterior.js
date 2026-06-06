const { GoogleAuth } = require('google-auth-library');

(async () => {
  const auth = new GoogleAuth({
    keyFile: './serviceAccount-gestaojoey.json',
    scopes: ['https://www.googleapis.com/auth/firebase'],
  });
  const client = await auth.getClient();
  const tokenObj = await client.getAccessToken();
  const token = tokenObj.token;

  const rulesetUrl = 'https://firebaserules.googleapis.com/v1/projects/gestaojoey/rulesets/df2958fb-b1cf-4806-862a-058bf7446070';
  const res = await fetch(rulesetUrl, { headers: { Authorization: `Bearer ${token}` } });
  const ruleset = await res.json();

  console.log('=== SOURCE DO RULESET ANTERIOR (df2958fb) ===');
  if (ruleset.source && ruleset.source.files) {
    ruleset.source.files.forEach(f => {
      console.log(`\n--- ${f.name} ---`);
      console.log(f.content);
    });
  }
})();
