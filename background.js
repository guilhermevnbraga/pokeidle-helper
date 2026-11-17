/* Relógio de reserva: o service worker acorda a cada 30 s e cutuca a aba do jogo.
   Assim a reposição de poções continua mesmo se o Chrome frear os timers da aba oculta. */
const arma = () => chrome.alarms.create('pk-tick', { periodInMinutes: 0.5 });
chrome.runtime.onInstalled.addListener(arma);
chrome.runtime.onStartup.addListener(arma);
arma();

chrome.alarms.onAlarm.addListener(async a => {
  if (a.name !== 'pk-tick') return;
  const tabs = await chrome.tabs.query({ url: 'https://pokeidle.io/app*' });
  // impede o Chrome (Memory Saver) de descartar a aba do jogo
  for (const t of tabs) chrome.tabs.update(t.id, { autoDiscardable: false }).catch(() => {});
  for (const t of tabs) chrome.tabs.sendMessage(t.id, { type: 'pk-tick' }).catch(() => {});
});
