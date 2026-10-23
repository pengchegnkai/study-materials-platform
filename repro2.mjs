import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const dom = new JSDOM(fs.readFileSync('dist/index.html', 'utf8'), { url: 'http://localhost:8787/', pretendToBeVisual: true });
for (const key of Object.getOwnPropertyNames(dom.window)) { try { if (!(key in global)) global[key] = dom.window[key]; } catch {} }
global.window = dom.window;
global.document = dom.window.document;

const realFetch = global.fetch;
let fetchCount = 0;
global.fetch = function (input, init = {}) {
  fetchCount++;
  const url = typeof input === 'string' && input.startsWith('/') ? 'http://localhost:8787' + input : input;
  console.log(`[fetch #${fetchCount}]`, url);
  const p = realFetch(url, { ...init, headers: { ...(init.headers || {}), Cookie: process.env.COOKIE } });
  p.then(r => console.log(`[fetch #${fetchCount} 完成]`, r.status)).catch(e => console.log(`[fetch #${fetchCount} 失败]`, e.message));
  return p;
};

const jsFile = fs.readdirSync('dist/assets').find((f) => f.startsWith('index-') && f.endsWith('.js'));
try { await import('./dist/assets/' + jsFile); console.log('[bundle 载入成功]'); }
catch (e) { console.log('[bundle 载入崩溃]', e.message); }

history.pushState({}, '', '/teacher');
window.dispatchEvent(new dom.window.PopStateEvent('popstate'));

setTimeout(() => {
  console.log('共 fetch 次数:', fetchCount);
  console.log('ROOT:', document.getElementById('root')?.innerHTML?.slice(0, 300) || '(空)');
  process.exit(0);
}, 3000);
