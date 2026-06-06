const { GoogleAuth } = require('google-auth-library');

(async () => {
  const auth = new GoogleAuth({
    keyFile: './serviceAccount-pedidos-joey.json',
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  const client = await auth.getClient();
  const t = (await client.getAccessToken()).token;

  const url = 'https://cloudscheduler.googleapis.com/v1/projects/pedidos-joey/locations/us-central1/jobs';
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + t } });
  const data = await res.json();

  console.log('=== CLOUD SCHEDULER JOBS — projeto pedidos-joey ===\n');
  if (data.error) {
    console.log('ERRO:', JSON.stringify(data.error, null, 2));
    return;
  }
  if (!data.jobs || data.jobs.length === 0) {
    console.log('Nenhum job encontrado.');
    return;
  }
  data.jobs.forEach(j => {
    console.log(`Job: ${j.name.split('/').pop()}`);
    console.log(`  Schedule:     ${j.schedule}`);
    console.log(`  Timezone:     ${j.timeZone}`);
    console.log(`  State:        ${j.state}`);
    console.log(`  Last attempt: ${j.lastAttemptTime || '(nunca)'}`);
    console.log(`  Status code:  ${j.status?.code ?? '(ok)'}`);
    if (j.status?.message) console.log(`  Status msg:   ${j.status.message}`);
    console.log(`  Next run:     ${j.scheduleTime || '(?)'}`);
    console.log(`  User update:  ${j.userUpdateTime || '(?)'}`);
    console.log('');
  });
})();
