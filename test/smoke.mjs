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
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    // /frames/ serves private test images from PK_FACE_FRAMES; they are not part of this repository
    const dir = url.startsWith('/frames/') ? process.env.PK_FACE_FRAMES : root;
    if (!dir) throw new Error('no frames folder');
    const p = path.join(dir, url.startsWith('/frames/') ? path.basename(url) : url);
    if (!p.startsWith(dir)) throw new Error('outside');
    const data = await readFile(p);
    const type = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.jpg': 'image/jpeg', '.json': 'application/json' }[path.extname(p)] || (p.endsWith('.html') ? 'text/html' : 'application/octet-stream');
    res.writeHead(200, { 'Content-Type': type });
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

// ---- 1b. page key: the page opens its own session; a refused key fails open
{
  const context = await browser.newContext({ permissions: ['camera'] });
  const page = await context.newPage();
  await page.addInitScript(mocks);
  let asked = null;
  await page.route('**/api/page/session', async (route) => {
    asked = route.request().postDataJSON();
    if (asked.key === 'pk_pub_bad') return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'Add localhost to the key\'s domains in your dashboard.', code: 'domain_not_allowed' }) });
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ sessionId: 's_1', sessionToken: 'pks_x', endpoint: '/pk2', organisation: 'Acme Hiring', retentionDays: 30, settings: { snapshotIntervalSec: 15 } }) });
  });
  await page.goto(`${base}/test/page.html`);
  const ok = await page.evaluate(async () => {
    const evs = []; const p = ProctorKit.createProctor({ key: 'pk_pub_good', apiBase: '/api', faceDetection: false, ui: 'headless', context: { candidateId: 'c_9' }, onEvent: (e) => evs.push(e) });
    await p.runChecks(); return { types: evs.map((e) => e.type), sessionId: p.sessionId };
  });
  check('page key: session opened before the checks', ok.types[0] === 'cloud_connected' && ok.sessionId === 's_1', ok.types.join(','));
  check('page key: candidate id sent as the external id', asked?.externalId === 'c_9');
  const warns = []; page.on('console', (m) => { if (m.type() === 'warning') warns.push(m.text()); });
  const bad = await page.evaluate(async () => {
    const evs = []; const p = ProctorKit.createProctor({ key: 'pk_pub_bad', apiBase: '/api', faceDetection: false, ui: 'headless', onEvent: (e) => evs.push(e) });
    const r = await p.runChecks(); return { first: evs[0], checksRan: evs.length > 1 || r.ok !== undefined };
  });
  check('refused key: fails open with the reason', bad.first?.type === 'cloud_unavailable' && bad.first.data.code === 'domain_not_allowed' && bad.checksRan);
  check('refused key: developer sees the fix in the console', warns.some((w) => w.includes('Add localhost')));
  await context.close();
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
      faceDetection: false,
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
  check('camera preview is shown during setup', await page.locator('.pk-cam.is-setup').isVisible() && (await page.locator('.pk-cam__status').innerText()) === 'Keep your face in this picture');
  check('consent states organisation, cadence and retention', consent.includes('Acme Hiring') && consent.includes('every 2 seconds') && consent.includes('90 days'));
  check('start is disabled until consent is ticked', await page.locator('[data-step="consent"] .pk-btn').isDisabled());
  await page.locator('.pk-check input').check();
  await page.locator('[data-step="consent"] .pk-btn').click();
  const result = await page.evaluate(() => window.checks);
  check('checks pass', result.ok === true);

  check('start() succeeds', await page.evaluate(() => window.proctor.start()));
  await page.evaluate(() => { window.pauseLog = []; window.proctor.on('paused', (e) => window.pauseLog.push(['paused', e.data.reason])); window.proctor.on('resumed', (e) => window.pauseLog.push(['resumed', e.data.pausedMs])); });
  check('camera preview is hidden once the test starts', (await page.locator('.pk-cam').count()) === 0);
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
  const used = await page.evaluate(() => ({ active: window.proctor.activeMs(), log: window.pauseLog }));
  check('host listeners hear every pause and resume', used.log.some((x) => x[0] === 'paused') && used.log.filter((x) => x[0] === 'resumed').length >= 1 && used.log.filter((x) => x[0] === 'resumed').every((x) => x[1] > 0), `${used.log.filter((x) => x[0] === 'paused').length} paused, ${used.log.filter((x) => x[0] === 'resumed').length} resumed`);
  check('activeMs() is the test time minus the pauses', Math.abs(used.active - (report.durationMs - report.pausedMs)) < 50 && used.active < report.durationMs, `${used.active} ms of ${report.durationMs}`);
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

// ---- 4. settings, on-device face count (stubbed detector), software camera, frozen feed, behaviour signals
{
  const context = await browser.newContext({ permissions: ['camera'] });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(mocks);
  await page.addInitScript(() => {
    // a still picture offered as a camera called "OBS Virtual Camera"
    navigator.mediaDevices.getUserMedia = async () => {
      const c = document.createElement('canvas'); c.width = 640; c.height = 480;
      const g = c.getContext('2d'); g.fillStyle = '#567'; g.fillRect(0, 0, 640, 480); g.fillStyle = '#fc9'; g.fillRect(220, 120, 200, 240);
      const st = c.captureStream();
      setTimeout(() => { g.fillRect(0, 0, 1, 1); }, 200); // one repaint so the first frame is delivered
      Object.defineProperty(st.getVideoTracks()[0], 'label', { value: 'OBS Virtual Camera' });
      return st;
    };
  });
  await page.goto(`${base}/test/page.html`);
  await page.evaluate(() => {
    window.snaps = []; window.evs = []; window.__faces = 0;
    window.proctor = ProctorKit.createProctor({
      cameraTile: true,
      settings: { faceSetupWaitSec: 1, snapshotIntervalSec: 2, snapshotJitterSec: 1, absencePromptSec: 2, faceCheckIntervalSec: 0.4, frozenFeedFrames: 2, longFocusLossSec: 1, fastAnswerSec: 5, pointerAwayMinMs: 300, notASetting: 9, hideCameraAfterSetup: 'yes' },
      faceDetection: { detect: () => window.__faces },
      onEvent: (e) => window.evs.push(e),
      onSnapshot: (s) => window.snaps.push({ kind: s.kind, ms: s.ms, reason: s.reason }),
    });
    window.checks = window.proctor.runChecks();
  });
  const types = () => page.evaluate(() => window.evs.map((e) => e.type));
  const ev = (t) => page.evaluate((t) => window.evs.find((e) => e.type === t), t);
  await page.locator('[data-step="camera"] .pk-btn').click();
  await page.locator('[data-step="camera"] .pk-step__error').waitFor();
  check('setup does not pass until a face is in view', (await page.locator('[data-step="camera"] .pk-step__error').innerText()) === 'We could not see your face.' && !(await page.evaluate(() => window.proctor.ready())));
  check('start() is refused before the prerequisites are met', (await page.evaluate(() => window.proctor.start())) === false);
  await page.evaluate(() => { window.__faces = 1; });
  await page.locator('[data-step="camera"] .pk-btn').click();
  await page.locator('[data-step="screen"] .pk-btn').click();
  await page.locator('.pk-check input').check();
  await page.locator('[data-step="consent"] .pk-btn').click();
  await page.evaluate(() => window.checks);
  check('software camera is flagged by name', (await ev('virtual_camera'))?.data.label === 'obs virtual camera' && (await ev('virtual_camera')).severity === 'high');
  await page.evaluate(() => { window.proctor.setContext({ questionId: 'Q1' }); window.proctor.start(); });
  check('cameraTile: true keeps the preview during the test', await page.locator('.pk-cam:not(.is-setup)').isVisible());
  check('settings reach the SDK; unknown or mistyped ones are ignored', (await ev('started')).data.intervalSec === 2);

  await sleep(900);
  await page.evaluate(() => { window.__faces = 0; });
  await sleep(3200);
  const gone = await ev('no_face');
  check('no face for the set time is reported', !!gone && gone.severity === 'warn' && gone.data.seconds >= 2, gone ? `${gone.data.seconds} s` : '');
  check('candidate is asked to move back into view', (await page.locator('.pk-notice').innerText()) === 'Move back into view of your camera.');
  check('the prompt does not block the test', !(await page.evaluate(() => window.proctor.isBlocked())));
  await page.evaluate(() => { window.__faces = 1; });
  await sleep(900);
  check('prompt clears when the face returns', (await page.locator('.pk-notice').count()) === 0 && (await types()).includes('face_returned'));
  const shotsBefore = await page.evaluate(() => window.snaps.filter((s) => s.reason === 'event').length);
  await page.evaluate(() => { window.__faces = 2; });
  await sleep(1400);
  const shotsAfter = await page.evaluate(() => window.snaps.filter((s) => s.reason === 'event').length);
  check('two faces raise no flag and no prompt, only an extra frame', !(await types()).includes('multiple_faces') && shotsAfter > shotsBefore && (await page.locator('.pk-notice').count()) === 0, `${shotsAfter - shotsBefore} extra frame(s)`);
  await page.evaluate(() => { window.__faces = 1; });

  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await sleep(1400);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await sleep(300);
  await page.evaluate(() => window.proctor.setContext({ questionId: 'Q2' }));
  const fast = await ev('answer_after_focus_loss');
  check('moving on right after a long focus loss is reported against the question answered', !!fast && fast.context.questionId === 'Q1' && fast.data.awayMs >= 1000 && fast.data.sinceReturnMs < 5000, fast ? JSON.stringify(fast.data) : '');
  check('focus loss records time since the question appeared', (await ev('focus_lost')).data.sinceQuestionMs > 0);
  await page.evaluate(() => window.proctor.setContext({ questionId: 'Q3' }));
  check('a normal move to the next question is not reported', (await types()).filter((t) => t === 'answer_after_focus_loss').length === 1);

  await page.evaluate(() => document.documentElement.dispatchEvent(new Event('mouseleave')));
  await sleep(500);
  await page.evaluate(() => document.documentElement.dispatchEvent(new Event('mouseenter')));
  const ptr = await ev('pointer_left_page');
  check('pointer leaving the page is reported', !!ptr && ptr.data.awayMs >= 300, ptr ? `${ptr.data.awayMs} ms` : '');

  await sleep(4000);
  const frozen = await ev('camera_frozen');
  check('identical webcam frames are reported as a frozen feed, once', !!frozen && frozen.severity === 'high' && (await types()).filter((t) => t === 'camera_frozen').length === 1, frozen ? `${frozen.data.frames} frames` : '');
  const shots = (await page.evaluate(() => window.snaps)).filter((s) => s.kind === 'webcam' && s.reason === 'interval').map((s) => s.ms);
  const gaps = shots.slice(2).map((ms, i) => ms - shots[i + 1]);
  check('capture timing varies within the allowed range', gaps.length >= 3 && gaps.every((g) => g > 600 && g < 3500) && Math.max(...gaps) - Math.min(...gaps) > 50, gaps.join(', ') + ' ms');
  await page.evaluate(() => window.proctor.stop());
  check('no page errors', errors.length === 0, errors.join('; '));
  await context.close();
}

// ---- 4b. the face detector cannot be loaded: the test does not start
{
  const context = await browser.newContext({ permissions: ['camera'] });
  const page = await context.newPage();
  await page.addInitScript(mocks);
  await page.goto(`${base}/test/page.html`);
  const r = await page.evaluate(async () => {
    const evs = [];
    const p = ProctorKit.createProctor({ ui: 'headless', require: { screenShare: false }, faceDetection: { moduleUrl: '/missing.mjs' }, onEvent: (e) => evs.push(e) });
    p.giveConsent();
    const res = await p.runChecks();
    return { res, started: p.start(), failed: evs.some((e) => e.type === 'check_failed' && e.data.check === 'face_detection') };
  });
  check('a face detector that fails to load blocks the start', r.res.ok === false && r.res.reason === 'face_detection' && r.started === false && r.failed, JSON.stringify(r.res));
  await context.close();
}

// ---- 5. the real MediaPipe face detector on real-looking frames. Needs the model file and a private frames folder:
//      curl -o test/blaze_face_short_range.tflite https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite
//      PK_FACE_FRAMES=/path/to/frames npm test      (PK_FACE_EVAL=1 also prints the count for every frame in manifest.json)
const haveModel = await readFile(path.join(root, 'test/blaze_face_short_range.tflite')).then(() => true, () => false);
if (!process.env.PK_FACE_FRAMES || !haveModel) console.log('skip face detector test (set PK_FACE_FRAMES and download the model to run it)');
else {
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${base}/test/page.html`);
  const frames = process.env.PK_FACE_EVAL ? JSON.parse(await readFile(path.join(process.env.PK_FACE_FRAMES, 'manifest.json'), 'utf8')).map((f) => f.id) : ['one_daylight_1', 'nobody_empty_chair_1', 'two_side_by_side_1'];
  const counts = await page.evaluate(async (frames) => {
    // show each image through a canvas stream, the way a camera feed reaches the SDK
    const c = document.createElement('canvas'); c.width = 600; c.height = 450;
    const g = c.getContext('2d');
    g.fillRect(0, 0, 600, 450);
    const v = document.createElement('video'); v.muted = true; v.srcObject = c.captureStream(); void v.play().catch(() => {});
    for (let i = 0; i < 50 && !v.videoWidth; i++) { g.fillRect(0, 0, 1 + (i % 2), 1); await new Promise((r) => setTimeout(r, 100)); }
    const t0 = performance.now();
    const counter = await ProctorKit.loadFaceCounter({ moduleUrl: '/node_modules/@mediapipe/tasks-vision/vision_bundle.mjs', wasmUrl: '/node_modules/@mediapipe/tasks-vision/wasm', modelUrl: '/test/blaze_face_short_range.tflite' });
    const loadMs = Math.round(performance.now() - t0);
    const out = {}; let detectMs = 0;
    for (const id of frames) {
      const img = new Image(); img.src = `/frames/${id}.jpg`; await img.decode();
      g.drawImage(img, 0, 0, 600, 450); g.fillRect(0, 0, 1, 1);
      await new Promise((r) => setTimeout(r, 180));
      const t = performance.now(); out[id] = await counter.count(v); detectMs += performance.now() - t;
    }
    counter.close();
    return { out, loadMs, perFrameMs: Math.round(detectMs / frames.length) };
  }, frames);
  check('face detector: one person -> 1 face', counts.out.one_daylight_1 === 1, `loaded in ${counts.loadMs} ms, ${counts.perFrameMs} ms per frame`);
  check('face detector: empty chair -> 0 faces', counts.out.nobody_empty_chair_1 === 0);
  check('face detector: two people side by side -> 2 faces', counts.out.two_side_by_side_1 === 2);
  check('face detector: no page errors', errors.length === 0, errors.join('; '));
  if (process.env.PK_FACE_EVAL) {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(process.env.PK_FACE_EVAL === '1' ? '/tmp/face_eval.json' : process.env.PK_FACE_EVAL, JSON.stringify(counts.out, null, 1));
    console.log('face counts written for', Object.keys(counts.out).length, 'frames');
  }
  await page.close();
}

await browser.close();
server.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
