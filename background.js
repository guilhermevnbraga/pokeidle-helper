/* Relógio de reserva: o service worker acorda a cada 30 s e cutuca a aba do jogo.
   Assim a reposição de poções continua mesmo se o Chrome frear os timers da aba oculta. */
const arma = () => chrome.alarms.create('pk-tick', { periodInMinutes: 0.5 });
chrome.runtime.onInstalled.addListener(arma);
chrome.runtime.onStartup.addListener(arma);
arma();

/* Dev: só em extensão descompactada (sem update_url). A cada tick compara os arquivos da extensão com o
   baseline do carregamento; se mudaram em disco, chama chrome.runtime.reload() (a aba do jogo precisa de F5 depois).
   O baseline fica em Cache Storage (sem permissão extra) porque o service worker dorme entre os ticks. */
const DEV = !chrome.runtime.getManifest().update_url;
const devHash = async () => {
  const m = chrome.runtime.getManifest();
  const files = ['manifest.json', 'background.js', ...new Set((m.content_scripts || []).flatMap(c => c.js || []))];
  let h = 0, n = 0;
  for (const f of files) {
    const t = await (await fetch(chrome.runtime.getURL(f), { cache: 'no-store' })).text();
    n += t.length;
    for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0;
  }
  return h + ':' + n;
};
const DEV_KEY = 'https://pk-dev.invalid/hash'; // a Cache API só aceita chaves http(s)
const devStore = async v => { const c = await caches.open('pk-dev'); if (v == null) { const r = await c.match(DEV_KEY); return r ? r.text() : null; } await c.put(DEV_KEY, new Response(v)); };
const devBaseline = () => DEV && devHash().then(devStore).catch(() => {});
chrome.runtime.onInstalled.addListener(devBaseline);
chrome.runtime.onStartup.addListener(devBaseline);
const devCheck = async () => {
  if (!DEV) return;
  try {
    const now = await devHash(), old = await devStore();
    if (old == null) return devStore(now);
    if (now !== old) { await devStore(now); chrome.runtime.reload(); }
  } catch (e) {}
};

chrome.alarms.onAlarm.addListener(async a => {
  if (a.name !== 'pk-tick') return;
  devCheck();
  const tabs = await chrome.tabs.query({ url: 'https://pokeidle.io/app*' });
  // impede o Chrome (Memory Saver) de descartar a aba do jogo
  for (const t of tabs) chrome.tabs.update(t.id, { autoDiscardable: false }).catch(() => {});
  for (const t of tabs) chrome.tabs.sendMessage(t.id, { type: 'pk-tick' }).catch(() => {});
});
