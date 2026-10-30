// Usage: node render/shot.mjs "file://$PWD/render/index.html?view=front&w=1600&h=1100" images/front.png 1600 1100
// Views: front | rear | side | bottom | top. Add &bale=0 to render it empty,
// &nets=1 to hang 4 square-bale nets instead of the round bale, &roof=0 to leave the roof off.
// Opens a new tab in the already-running Chrome (port 9222), waits for window.__done, screenshots, closes the tab.
import { writeFileSync } from 'node:fs';

const [url, out, w = '1600', h = '1100'] = process.argv.slice(2);
const tab = await (await fetch('http://127.0.0.1:9222/json/new?about:blank', { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
await new Promise((r) => (ws.onopen = r));
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });

try {
  await send('Emulation.setDeviceMetricsOverride', { width: +w, height: +h, deviceScaleFactor: 1, mobile: false });
  await send('Page.enable');
  await send('Page.navigate', { url });
  let ok = false;
  for (let i = 0; i < 120 && !ok; i++) {
    await new Promise((r) => setTimeout(r, 250));
    const r = await send('Runtime.evaluate', { expression: 'window.__done === true', returnByValue: true });
    ok = r.result?.result?.value === true;
  }
  if (!ok) {
    const r = await send('Runtime.evaluate', { expression: 'document.title', returnByValue: true });
    throw new Error('render did not finish; title=' + r.result?.result?.value);
  }
  const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: +w, height: +h, scale: 1 } });
  writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
  console.log('wrote', out);
} finally {
  await fetch(`http://127.0.0.1:9222/json/close/${tab.id}`);
  ws.close();
}
