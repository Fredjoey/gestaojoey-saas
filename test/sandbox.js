// Sandbox dos testes: roda o <script> principal do painel.html / entregador.html num `vm` do Node, com DOM e Firebase
// simulados (nada sai da máquina). O Firestore falso guarda os listeners (onSnapshot) e registra as escritas, para o
// teste disparar um snapshot e ver o que o painel gravaria.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..');

// Maior <script> inline do HTML (o do app; os outros são src= ou pequenos).
function scriptPrincipal(arquivo) {
  const html = fs.readFileSync(path.isAbsolute(arquivo) ? arquivo : path.join(RAIZ, arquivo), 'utf8');
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m, maior = '';
  while ((m = re.exec(html))) if (m[1].length > maior.length) maior = m[1];
  return maior;
}

// Stub universal: qualquer propriedade/chamada devolve outro stub; o que for ATRIBUÍDO fica guardado.
function stub(nome) {
  const guardado = {};
  const P = new Proxy(function () {}, {
    get(t, k) {
      if (k in guardado) return guardado[k];
      if (k === Symbol.toPrimitive) return () => '';
      if (k === 'then') return undefined;                 // não é Promise
      if (k === 'toString' || k === 'valueOf') return () => '';
      if (k === 'length') return 0;
      if (k === Symbol.iterator) return function* () {};
      if (k === 'classList') return (guardado.classList = classList());
      if (k === 'style') return (guardado.style = {});
      if (k === 'dataset') return (guardado.dataset = {});
      if (k === 'value' || k === 'textContent' || k === 'innerHTML') return '';
      if (k === 'checked' || k === 'disabled') return false;
      return (guardado[k] = stub(nome + '.' + String(k)));
    },
    set(t, k, v) { guardado[k] = v; return true; },
    apply() { return stub(nome + '()'); },
    construct() { return stub('new ' + nome); },
    has() { return true; },
  });
  return P;
}
function classList() {
  const s = new Set();
  return { add: (...c) => c.forEach((x) => s.add(x)), remove: (...c) => c.forEach((x) => s.delete(x)), contains: (c) => s.has(c), toggle: (c, f) => ((f ?? !s.has(c)) ? (s.add(c), true) : (s.delete(c), false)) };
}

// Firestore falso: listeners por caminho + registro de escritas (set/update/add/delete).
function firestoreFalso() {
  const listeners = [];
  const escritas = [];
  const docs = {};                                            // caminho → dados (o que o get() devolve)
  const snapDoc = (p) => ({ exists: p in docs, id: p.split('/').pop(), data: () => (docs[p] ? { ...docs[p] } : undefined) });
  function docRef(p) {
    return {
      id: p.split('/').pop(), path: p,
      get: async () => snapDoc(p),
      set: async (data, opts) => { escritas.push({ op: 'set', path: p, data, opts }); docs[p] = { ...(opts && opts.merge ? docs[p] : {}), ...data }; },
      update: async (data) => { escritas.push({ op: 'update', path: p, data }); docs[p] = { ...docs[p], ...data }; },
      delete: async () => { escritas.push({ op: 'delete', path: p }); delete docs[p]; },
      onSnapshot: (cb) => { listeners.push({ path: p, cb }); return () => {}; },
      collection: (c) => colRef(p + '/' + c),
    };
  }
  function colRef(p) {
    const q = {
      path: p,
      doc: (id) => docRef(p + '/' + (id || 'auto' + escritas.length)),
      add: async (data) => { escritas.push({ op: 'add', path: p, data }); return docRef(p + '/auto'); },
      where: () => q, orderBy: () => q, limit: () => q, startAfter: () => q, endBefore: () => q,
      get: async () => ({ docs: [], empty: true, size: 0, forEach() {} }),
      onSnapshot: (cb) => { listeners.push({ path: p, cb }); return () => {}; },
    };
    return q;
  }
  const db = {
    collection: (p) => colRef(p),
    doc: (p) => docRef(p),
    batch: () => ({ set() {}, update() {}, delete() {}, commit: async () => {} }),
    runTransaction: async (fn) => fn({ get: async (r) => r.get(), set() {}, update() {} }),
    enablePersistence: async () => {},
    settings() {},
  };
  return { db, listeners, escritas, docs };
}

// Snapshot falso de coleção a partir de objetos { id, ...dados } (o painel lê d.data(), o app do motoboy d.id + d.data()).
function snapshot(lista) {
  const docs = lista.map((o) => ({ id: String(o.id), data: () => ({ ...o }), exists: true }));
  return { docs, size: docs.length, empty: !docs.length, forEach: (f) => docs.forEach(f), docChanges: () => docs.map((d) => ({ type: 'added', doc: d })) };
}

// Carrega um dos apps num contexto novo. Devolve { ctx, rodar(codigo), fs (Firestore falso), elementos, notificacoes }.
function carregar(arquivo, { busca = '?tenant=teste', host = 'painel.gestaojoey.com.br' } = {}) {
  const elementos = {};
  const documento = stub('document');
  documento.getElementById = (id) => (elementos[id] = elementos[id] || stub('#' + id));
  documento.querySelector = () => null;
  documento.querySelectorAll = () => [];
  documento.createElement = (t) => stub('<' + t + '>');
  documento.addEventListener = () => {};
  documento.body = stub('body');
  documento.title = 'Teste';
  const nome = path.basename(arquivo);
  const loc = { search: busca, hostname: host, href: `https://${host}/${nome}${busca}`, pathname: '/' + nome, origin: `https://${host}`, hash: '' };
  const armazem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
  const ff = firestoreFalso();
  const fb = stub('firebase');
  const firestore = () => ff.db;
  firestore.FieldValue = { serverTimestamp: () => ({ _sentinela: 'serverTimestamp' }), delete: () => ({ _sentinela: 'delete' }), increment: (n) => ({ _sentinela: 'increment', n }), arrayUnion: (...a) => ({ _sentinela: 'arrayUnion', a }), arrayRemove: (...a) => ({ _sentinela: 'arrayRemove', a }) };
  firestore.Timestamp = { now: () => ({ toMillis: () => Date.now() }), fromMillis: (ms) => ({ toMillis: () => ms }), fromDate: (d) => ({ toMillis: () => d.getTime() }) };
  fb.firestore = firestore;
  const notificacoes = [];
  const sb = {
    console: { log() {}, info() {}, debug() {}, warn() {}, error() {} },
    document: documento, location: loc, localStorage: armazem(), sessionStorage: armazem(),
    navigator: { userAgent: 'node', serviceWorker: { register: () => Promise.resolve(stub('reg')), addEventListener() {}, ready: Promise.resolve(stub('reg')) }, clipboard: stub('clip'), geolocation: undefined },
    firebase: fb,
    setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {}, requestAnimationFrame: () => 0,
    fetch: async () => ({ ok: false, status: 503, json: async () => ({}) }),
    URLSearchParams, URL, TextEncoder, TextDecoder, Notification: stub('Notification'),
    Audio: function () { return stub('audio'); }, Image: function () { return stub('img'); }, atob, btoa,
    alert: () => {}, confirm: () => true, prompt: () => null,
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }), addEventListener: () => {}, removeEventListener: () => {},
    innerWidth: 1280, innerHeight: 800, open: () => null, print: () => {}, google: undefined, L: undefined, Chart: stub('Chart'),
    MutationObserver: function () { return { observe() {}, disconnect() {} }; },
    IntersectionObserver: function () { return { observe() {}, disconnect() {} }; },
    ResizeObserver: function () { return { observe() {}, disconnect() {} }; },
    performance: { now: () => Date.now() }, crypto: require('crypto').webcrypto, structuredClone,
  };
  sb.window = sb; sb.self = sb; sb.globalThis = sb; sb.top = sb; sb.parent = sb;
  vm.createContext(sb);
  vm.runInContext(scriptPrincipal(arquivo), sb, { filename: arquivo });
  const rodar = (codigo) => vm.runInContext(codigo, sb);
  // notify() do painel → lista (o app do motoboy não tem notify)
  if (rodar('typeof notify') === 'function') { sb.__notificacoes = notificacoes; rodar('notify = (m, t) => __notificacoes.push({ m: String(m), t })'); }
  return { ctx: sb, rodar, fs: ff, elementos, notificacoes };
}

// Espera as Promises pendentes (get/set do Firestore falso são assíncronos).
const esperar = () => new Promise((r) => setImmediate(r));

module.exports = { carregar, snapshot, esperar, scriptPrincipal };
