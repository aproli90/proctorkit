// End-to-end smoke test in headless Chromium with a fake camera, a mocked screen share and mocked full screen.
// Run with: npm test   (set PW_CHROME=/path/to/chrome to use a system browser)
import { chromium } from 'playwright';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = http.createServer(async (req, res) => {
  try {
    const p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!p.startsWith(root)) throw new Error('outside');
    const data = await readFile(p);
    res.writeHead(200, { 'Content-Type': p.endsWith('.js') ? 'text/javascript' : 'text/html' });
    res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

let failed = 0;
const check = (name, cond, extra = '') => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); if (!cond) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Mocks: getDisplayMedia returns a canvas stream whose reported surface the test controls; full screen is simulated.
const mocks = () => {
  window.__surface = 'monitor';
  window.__shares = 0;
  navigator.mediaDevices.getDisplayMedia = async () => {
    window.__shares++;
    const c = document.createElement('canvas'); c.width = 1280; c.height = 720;
    const g = c.getContext('2d');
    const paint = () => { g.fillStyle = `hsl(${(Date.now() / 20) % 360} 60% 50%)`; g.fillRect(0, 0, 1280, 720); };
    paint(); setInterval(paint, 100);
    const s = c.captureStream(10);
    const t = s.getVideoTracks()[0];
    const surface = window.__surface;
    t.getSettings = () => ({ displaySurface: surface, width: 1280, height: 720 });
    window.__lastScreenTrack = t;
    return s;
  };
  const realGum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async (c) => { const s = await realGum(c); window.__lastCamTrack = s.getVideoTracks()[0]; return s; };
  let fs = null;
  Object.defineProperty(document, 'fullscreenElement', { get: () => fs, configurable: true });
  Element.prototype.requestFullscreen = function () { fs = this; document.dispatchEvent(new Event('fullscreenchange')); return Promise.resolve(); };
  document.exitFullscreen = () => { fs = null; document.dispatchEvent(new Event('fullscreenchange')); return Promise.resolve(); };
};

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROME || undefined,
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--no-sandbox'],
});

// ---- 1. unsupported browser: returns at once instead of hanging
{
  const page = await browser.newPage();
  await page.addInitScript(() => { delete MediaDevices.prototype.getDisplayMedia; });
  await page.goto(`${base}/test/page.html`);
  const r = await page.evaluate(() => ProctorKit.createProctor().runChecks());
  check('unsupported browser is reported', r.ok === false && r.reason === 'unsupported' && r.missing.includes('screen-share'), JSON.stringify(r));
  check('unsupported message is shown', await page.locator('.pk-pause').isVisible());
  await page.close();
}

// ---- 2. full flow with the default UI and a mocked backend
{
  const context = await browser.newContext({ permissions: ['camera'] });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(mocks);
  let snapPosts = 0, snapFails = 0, eventPosts = 0, tokenSeen = false;
  await page.route('**/pk/snapshot', async (route) => {
    snapPosts++;
    const body = route.request().postDataJSON();
    tokenSeen = tokenSeen || body.token === 'tok_test';
    if (snapPosts === 1) { snapFails++; return route.fulfill({ status: 500, body: 'x' }); }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
  await page.route('**/pk/events', (route) => { eventPosts++; return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }); });
  await page.goto(`${base}/test/page.html`);

  await page.evaluate(() => {
    window.snaps = []; window.evs = [];
    window.proctor = ProctorKit.createProctor({
      snapshots: { intervalSec: 2 },
      consent: { organisation: 'Acme Hiring', retentionDays: 90 },
      context: { candidateId: 'c_1' },
      cloud: { endpoint: '/pk', sessionToken: 'tok_test' },
      onEvent: (e) => window.evs.push(e),
      onSnapshot: (s) => window.snaps.push({ kind: s.kind, ms: s.ms, reason: s.reason, context: s.context, len: s.dataUrl.length }),
    });
    window.checks = window.proctor.runChecks();
  });
  const types = () => page.evaluate(() => window.evs.map((e) => e.type));

  check('system check opens on the camera step', await page.locator('.pk-step.is-active .pk-step__title').innerText() === 'Allow your camera');
  check('blocked while the system check is open', await page.evaluate(() => window.proctor.isBlocked()));
  await page.locator('.pk-step.is-active .pk-btn').click();
  await page.locator('[data-step="screen"].is-active').waitFor();

  await page.evaluate(() => { window.__surface = 'window'; });
  await page.locator('[data-step="screen"] .pk-btn').click();
  await page.locator('[data-step="screen"].is-error').waitFor();
  check('window share is rejected with a fix', (await page.locator('[data-step="screen"] .pk-step__error').innerText()).includes('window or tab'));
  await page.evaluate(() => { window.__surface = 'monitor'; });
  await page.locator('[data-step="screen"] .pk-btn').click();
  await page.locator('[data-step="consent"].is-active').waitFor();

  const consent = await page.locator('.pk-consent__list').innerText();
  check('consent states organisation, cadence and retention', consent.includes('Acme Hiring') && consent.includes('every 2 seconds') && consent.includes('90 days'));
  check('start is disabled until consent is ticked', await page.locator('[data-step="consent"] .pk-btn').isDisabled());
  await page.locator('.pk-check input').check();
  await page.locator('[data-step="consent"] .pk-btn').click();
  const result = await page.evaluate(() => window.checks);
  check('checks pass', result.ok === true);

  check('start() succeeds', await page.evaluate(() => window.proctor.start()));
  check('camera tile is shown', await page.locator('.pk-cam').isVisible());
  check('not blocked once running in full screen', !(await page.evaluate(() => window.proctor.isBlocked())));

  await page.evaluate(() => window.proctor.setContext({ questionId: 'Q07' }));
  await sleep(4500);
  let snaps = await page.evaluate(() => window.snaps);
  check('webcam and screen frames arrive', snaps.some((s) => s.kind === 'webcam') && snaps.some((s) => s.kind === 'screen'), `${snaps.length} frames`);
  check('frames carry the question id', snaps.at(-1).context.questionId === 'Q07' && snaps.at(-1).context.candidateId === 'c_1');
  check('frames are real images', snaps.every((s) => s.len > 2000));

  const pasted = await page.evaluate(() => { const e = new Event('paste', { bubbles: true, cancelable: true }); document.querySelector('#answer').dispatchEvent(e); return e.defaultPrevented; });
  check('paste is blocked and logged', pasted && (await types()).includes('paste_blocked'));

  // full screen exit pauses; the button brings it back
  await page.evaluate(() => document.exitFullscreen());
  check('leaving full screen pauses', await page.evaluate(() => window.proctor.isBlocked()) && (await page.locator('.pk-pause h2').innerText()) === 'Test paused');
  await page.locator('.pk-pause .pk-btn').click();
  await sleep(100);
  check('returning to full screen resumes', !(await page.evaluate(() => window.proctor.isBlocked())) && (await types()).includes('resumed'));

  // screen share dropped, then resumed: later screen frames must come from the new stream
  const before = await page.evaluate(() => window.__shares);
  await page.evaluate(() => {
    // what the browser does when the candidate clicks "Stop sharing"
    const track = window.__lastScreenTrack;
    track.stop(); track.dispatchEvent(new Event('ended'));
  });
  await page.evaluate(() => window.snaps.length = 0);
  check('stopping the share pauses', (await page.locator('.pk-pause p').first().innerText()).includes('Screen sharing stopped'));
  await page.locator('.pk-pause .pk-btn').click();
  await sleep(300);
  check('resume asks for a new share', (await page.evaluate(() => window.__shares)) === before + 1);
  if (await page.locator('.pk-pause').count()) await page.locator('.pk-pause .pk-btn').click(); // full screen again, if it was lost
  await sleep(4500);
  snaps = await page.evaluate(() => window.snaps);
  check('screen frames continue after a re-share', snaps.some((s) => s.kind === 'screen' && s.reason === 'interval'), `${snaps.filter((s) => s.kind === 'screen').length} screen frames`);

  // camera lost and restored
  await page.evaluate(() => { const t = window.__lastCamTrack; t.stop(); t.dispatchEvent(new Event('ended')); });
  check('losing the camera pauses', (await page.locator('.pk-pause p').first().innerText()).includes('camera stopped') && (await types()).includes('camera_lost'));
  await page.locator('.pk-pause .pk-btn').click();
  await sleep(300);
  check('camera is restored', (await types()).includes('camera_restored') && !(await page.evaluate(() => window.proctor.isBlocked())));

  // leaving the window
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await sleep(1200);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  const back = await page.evaluate(() => window.evs.find((e) => e.type === 'focus_returned'));
  check('time away is measured', !!back && back.data.awayMs >= 800 && (await types()).includes('focus_lost'), back ? `${back.data.awayMs} ms` : '');

  await sleep(5500); // let the event batch flush
  const report = await page.evaluate(() => window.proctor.stop());
  check('report totals', report.durationMs > 10000 && report.pausedMs > 0 && report.awayMs >= 800 && report.counts.snapshot > 3, `duration ${report.durationMs} paused ${report.pausedMs} away ${report.awayMs}`);
  check('report keeps context', report.context.questionId === 'Q07');
  check('interface is removed on stop', (await page.locator('[data-proctorkit]').count()) === 0);
  check('failed upload was retried', snapFails === 1 && snapPosts > 2 && tokenSeen, `${snapPosts} posts`);
  check('events were sent to the backend', eventPosts > 0, `${eventPosts} posts`);
  check('no page errors', errors.length === 0, errors.join('; '));
  await context.close();
}

// ---- 3. headless mode with no camera or screen requirement (the lightest free setup)
{
  const page = await browser.newPage();
  await page.addInitScript(mocks);
  await page.goto(`${base}/test/page.html`);
  const r = await page.evaluate(async () => {
    const p = ProctorKit.createProctor({ ui: 'headless', require: { camera: false, screenShare: false }, snapshots: false });
    const first = await p.runChecks();
    p.giveConsent();
    const second = await p.runChecks();
    const started = p.start();
    document.exitFullscreen();
    const pausedFor = p.pausedFor();
    const fixed = await p.retry('fullscreen');
    const rep = p.stop();
    return { first, second, started, pausedFor, fixed, types: rep.events.map((e) => e.type), hosts: document.querySelectorAll('[data-proctorkit]').length };
  });
  check('headless: consent is required first', r.first.reason === 'consent' && r.second.ok);
  check('headless: pause and retry work without UI', r.started && r.pausedFor[0] === 'fullscreen' && r.fixed && r.hosts === 0, r.types.join(','));
  await page.close();
}

await browser.close();
server.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
