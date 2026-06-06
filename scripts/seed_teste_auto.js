const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert('./serviceAccount-gestaojoey.json') });
admin.firestore().doc('clientes/teste-auto/config/loja').set({
  nome: 'Teste Auto',
  wpp: '',
  taxa: 5,
  end: '',
  bairros: [],
  horarios: {},
  tempoEntrega: '40-60 min',
  tempoRetirada: '20-30 min',
  tempoLocal: '15-20 min',
  aberto: true
}).then(() => { console.log('✅ config/loja criado'); process.exit(0); });
