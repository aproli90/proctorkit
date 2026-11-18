# ProctorKit

**Proctoring for the quiz you already built.**

[![npm](https://img.shields.io/npm/v/proctorkit)](https://www.npmjs.com/package/proctorkit) [![types](https://img.shields.io/npm/types/proctorkit)](#typescript) [![size](https://img.shields.io/bundlephobia/minzip/proctorkit)](https://bundlephobia.com/package/proctorkit) [![licence](https://img.shields.io/npm/l/proctorkit)](LICENSE)

One small browser library turns any web test into a proctored one: a system check, consent, full screen, entire-screen sharing, camera and face checks, regular photos and screenshots, and an event log tied to each question. It pauses the test when something breaks and helps the candidate fix it. Free, MIT licensed, written in TypeScript, no dependencies, about 11 kB gzipped.

```js
import { createProctor } from 'proctorkit';

const proctor = createProctor({ onEvent: console.log, onSnapshot: saveFrame });
if ((await proctor.runChecks()).ok) proctor.start();   // on the Start button
proctor.setContext({ questionId: 'Q1' });              // whenever the question changes
proctor.stop();                                        // on submit: returns the session report
```

<p>
  <img src="https://proctorkit.com/assets/candidate-consent.webp" alt="The system check and consent screen ProctorKit shows before a test" width="49%">
  <img src="https://proctorkit.com/assets/candidate-pause.webp" alt="The test paused after the candidate left full screen, with one button to return" width="49%">
</p>

> Status: 0.1, pre-release. The API may change before 1.0.

## Why teams use it

- **Keep your test.** It works on any web page you control: React, Vue, Svelte, Angular, a plain HTML form or a tool you built. Your questions, answers and scoring never pass through ProctorKit.
- **A ready interface, or none.** The built-in screens handle the system check, consent and pauses, with light and dark themes and every word replaceable. Or go headless and drive your own screens from events.
- **Fair to candidates.** Plain consent before anything is recorded, a pause screen with one button to fix each problem, and a timer that stops while the test is paused.
- **Evidence by question.** Every event, photo and screenshot carries the question on screen at that moment, so a reviewer sees what happened and where.
- **Hard to get wrong.** It checks browser support up front, never hangs, and keeps the test running if an upload fails.
- **Private by default.** Nothing is captured before `runChecks()`, and nothing leaves the page except through your own handlers.

## Everything in the free SDK

| Before the test | During the test | After the test |
| --- | --- | --- |
| Browser support check, with what is missing | Pauses on leaving full screen, stopping the share, losing the camera or adding a display, and resumes when fixed | A session report: duration, paused time, time away, counts per event type |
| Camera, with a preview for framing | Time away from the test window, per question | The full event log, each event with its question |
| Face in view, checked on the candidate's device | Prompts the candidate back into view | Every photo and screenshot, tagged with its question |
| Entire-screen share required, window and tab shares refused | Copy, cut, paste and right-click blocked and logged | |
| Single display required (Chromium) | Webcam photo and screenshot about every 10 seconds, plus extra ones when something happens | |
| Consent: what is recorded, why, for how long, who sees it | Pointer leaving the page | |

Plus, for developers: TypeScript types, ES module and script-tag builds, a headless mode, themes, replaceable text, every timing in one settings object, and `activeMs()` for a countdown that never counts a pause.

## Free SDK or ProctorKit Cloud

The SDK gives you the signals; what you do with them is up to you. [ProctorKit Cloud](https://proctorkit.com) is the optional hosted service for teams that would rather not build storage, review screens and checks themselves. Switching is one line: pass a key.

| | Free SDK | ProctorKit Cloud |
| --- | --- | --- |
| Everything in the table above | Yes | Yes |
| Where photos, screenshots and events go | Your handlers and your storage | Stored for you, deleted on schedule |
| A report per candidate, laid out by question | Build your own | Yes, with a private link for each reviewer |
| Dashboard for your team, keys locked to your domains | | Yes |
| AI review of every photo and screenshot: a phone in use, another person, another app on screen, the test hidden | | With Record + AI review |
| Review priority from 0 to 100, so the riskiest sessions come first | | With Record + AI review |
| Price | Free, forever | Record: free during launch. Record + AI review: $0.25 per candidate session\* (₹15 in India), first 50 free |

```js
const proctor = createProctor({ key: 'pk_pub_...' });   // the same proctor, now reporting to your dashboard
```

[Create a key](https://proctorkit.com/app/?new), [try the demo](https://proctorkit.com/demo/) (try to cheat; you get the report), or read the [docs](https://proctorkit.com/docs/) for the REST API.

\* One candidate session is one person taking one test of up to 30 minutes. Longer tests count by the minute: 45 minutes is 1.5 sessions. Tests that never start are not counted. Customers in India pay in rupees.

## Install

```bash
npm install proctorkit
```

or with a script tag (global `ProctorKit`):

```html
<script src="https://cdn.jsdelivr.net/npm/proctorkit/dist/proctorkit.global.js"></script>
```

## Quick start

React, with a page key from the [ProctorKit dashboard](https://proctorkit.com/app/?new) (results and reports in the dashboard):

```jsx
import { useEffect, useState } from 'react';
import { createProctor } from 'proctorkit';

const proctor = createProctor({ key: 'pk_pub_...' });   // once, outside the component

export function Quiz({ candidateId, questions }) {
  const [started, setStarted] = useState(false);
  const [i, setI] = useState(0);

  const begin = async () => {                           // the Start button
    proctor.setContext({ candidateId });
    if ((await proctor.runChecks()).ok && proctor.start()) setStarted(true);
  };

  useEffect(() => { if (started) proctor.setContext({ questionId: questions[i].id }); }, [started, i]);

  const submit = () => { proctor.stop(); /* then save answers as before */ };
  // ...render the quiz once started
}
```

Without an account (free, nothing leaves the page except through your handlers): leave out `key` and take the events and frames yourself.

```js
const proctor = createProctor({
  consent: { organisation: 'Acme Hiring', retentionDays: 90 },
  onEvent: (event) => sendToYourServer(event),
  onSnapshot: (snapshot) => uploadToYourStorage(snapshot.dataUrl),
});
// runChecks(), start(), setContext() and stop() work the same way
```

Plain HTML, no build step:

```html
<script src="https://cdn.jsdelivr.net/npm/proctorkit/dist/proctorkit.global.js"></script>
<script>
  const proctor = ProctorKit.createProctor({ key: 'pk_pub_...' });
  document.querySelector('#start').onclick = async () => {
    if ((await proctor.runChecks()).ok && proctor.start()) showFirstQuestion();
  };
</script>
```

A complete page is in [`examples/basic.html`](examples/basic.html).

## Feature details

| Capability | Default | Notes |
| --- | --- | --- |
| Browser support check | on | Returns `{ ok: false, reason: 'unsupported', missing }` at once; never hangs |
| Camera required | on | Pauses if the camera stops; the candidate can turn it back on |
| Entire-screen share required | on | Rejects a window or tab share; pauses if sharing stops |
| Full screen required | on | Pauses on exit; one button returns |
| Single display required | on | Checked before and during the test (Chromium; ignored elsewhere) |
| Consent notice | on | States what is recorded, why, for how long, and who sees it |
| Copy, cut, paste, context menu blocked | on | Each attempt is logged |
| Time away from the test window | on | `focus_lost` and `focus_returned` with `awayMs` |
| Per-question behaviour | on | Time since the question appeared on each focus loss; the pointer leaving the page |
| Face in view, checked on the candidate's device | on | The test cannot start until the detector has loaded and a face is in view. During the test it asks the candidate to move back into view and reports `no_face`. It never reports other people. No frame leaves the page for it |
| Camera preview | setup only | Shown while the candidate sets up, hidden during the test |
| Webcam and screen frames | about every 10 s | JPEG data URLs; the exact moment varies by a few seconds; extra frames when something happens |
| Question tagging | `setContext()` | Every event and frame carries the context at that moment |
| Session report | `stop()` | Totals, counts per event type, full event list |

Everything above runs in the browser. Frames and events go only to your own `onEvent` and `onSnapshot` handlers unless you configure `cloud`.

## What it cannot do

Browser proctoring deters casual cheating and produces evidence for a reviewer. It does not stop a determined cheat, and you should not present it as if it does.

- It cannot see a phone, notes or a person outside the camera frame.
- Some screen-overlay tools do not appear in a shared screen.
- It records no sound, so it cannot hear someone dictating answers.
- It does not check who the candidate is.
- A mirrored second monitor or an HDMI splitter looks like one screen to a browser.
- Everything runs on a page the candidate controls. Treat a clean log as "nothing was observed", not as proof.
- Phones and tablets cannot share their screen from the browser, so the default setup needs a desktop browser. Chrome and Edge give the fullest checks.

## Configuration

```ts
createProctor({
  require: { camera: true, screenShare: true, fullscreen: true, singleDisplay: true },
  snapshots: { intervalSec: 10 },      // or false
  blockClipboard: true,
  consent: { organisation, retentionDays: 90, seenBy },
  ui: 'default',                       // or 'headless'
  theme: 'auto',                       // 'light' | 'dark' | 'auto'
  cameraTile: undefined,               // preview during setup only; true keeps it during the test, false never shows it
  faceDetection: {},                   // or false; see below
  settings: {},                        // timings and thresholds; see below
  strings: { pausedTitle: 'Test paused' },   // replace any text; see defaultStrings
  context: {},
  onEvent, onSnapshot,
  key: 'pk_pub_...',                   // optional: a page key from the ProctorKit dashboard
  cloud: { endpoint, sessionToken },   // optional: a session your server created with a server key
  apiBase: undefined,                  // where ProctorKit Cloud lives; leave unset
});
```

Lightest setup, with no camera or screen share:

```js
createProctor({ require: { camera: false, screenShare: false }, snapshots: false });
```

### Settings

Every timing and threshold is in one object, `defaultSettings`. Pass only what you want to change:

| Setting | Default | Meaning |
| --- | --- | --- |
| `snapshotIntervalSec` | 10 | Seconds between regular frames |
| `snapshotJitterSec` | 3 | Each frame is taken up to this many seconds early or late |
| `hideCameraAfterSetup` | true | Show the camera preview during the system check only |
| `faceSetupWaitSec` | 12 | During setup, how long to wait for a face before asking the candidate to adjust |
| `absencePromptSec` | 10 | No face for this long: ask the candidate to move back into view |
| `faceCheckIntervalSec` | 2 | Seconds between face checks |
| `multipleFacesChecks` | 2 | Consecutive checks with two or more faces before an extra frame is taken |
| `minFocusLossMs` | 800 | Shorter focus losses are ignored |
| `longFocusLossSec` | 5 | A longer focus loss is `warn`, a shorter one `info` |
| `pointerAwayMinMs` | 1500 | The pointer must be off the page this long to be reported |

With a ProctorKit backend, pass the `settings` object from the create-session response as it is.

### Face detection

Face detection uses [MediaPipe](https://ai.google.dev/edge/mediapipe/solutions/vision/face_detector) and runs in the candidate's browser. Its runtime and model (about 4.5 MB compressed, cached by the browser afterwards) are fetched during the camera step, by default from jsDelivr and Google's model storage.

While it is on, it is a prerequisite: the camera step passes only when the detector has loaded and the candidate's face is in view, and `start()` returns `false` until then. If the files cannot be loaded the candidate is told to check their connection and try again. Headless hosts call `prepareFaceDetection()` after `requestCamera()`; `runChecks()` returns `reason: 'face_detection'` when it fails.

It only answers "is the candidate's face in view". When it sees a second face it takes an extra frame and reports nothing, so that judging who else is present is left to whatever checks the frames afterwards.

```js
createProctor({ faceDetection: false });                                   // off
createProctor({ faceDetection: { moduleUrl, wasmUrl, modelUrl } });        // host the files yourself
createProctor({ faceDetection: { detect: (video) => myOwnFaceCount(video) } });
```

It finds faces, not people: a candidate looking down at the keyboard can read as no face, which is why the prompt waits ten seconds. It sees faces up to about two metres away.

Call `setContext({ questionId })` whenever the question changes. The per-question signals depend on it.

## API

| Method | Returns | What it does |
| --- | --- | --- |
| `runChecks()` | `Promise<CheckResult>` | Runs the system check and consent. Call from a click handler |
| `start()` | `boolean` | Starts guarding and recording. `false` if the checks have not passed |
| `stop()` | `ProctorReport` | Stops, releases camera and screen, removes the interface |
| `setContext(patch)` | `void` | Merges values into the context on later events and frames |
| `on(type, fn)` | `() => void` | Listens for one event type or `'*'`; returns an unsubscribe function |
| `isBlocked()` | `boolean` | True while the system check or a pause overlay is up |
| `pausedFor()` | `string[]` | Current pause reasons: `fullscreen`, `screen`, `camera`, `display` |
| `activeMs()` | `number` | Time since `start()` minus all pauses. Use it for your countdown |
| `retry(reason)` | `Promise<boolean>` | Tries to fix one pause reason (for headless hosts) |
| `getReport()` | `ProctorReport` | The report so far, without stopping |
| `support()` | `{ ok, missing }` | Missing browser features, without prompting |
| `ready()` | `boolean` | True when every requirement is met and `start()` would succeed |
| `requestCamera()`, `prepareFaceDetection()`, `requestScreenShare()`, `giveConsent()` | | The individual steps, for headless hosts |
| `sessionId` | `string \| null` | The ProctorKit Cloud session's ID once a page key has connected |

## TypeScript

The package ships its declarations; nothing extra to install. Exported types:

```ts
import { createProctor, Proctor, defaultSettings, defaultStrings } from 'proctorkit';
import type {
  ProctorConfig, ProctorEvent, ProctorEventType, Severity, ProctorContext, ProctorSettings,
  Snapshot, CheckResult, ProctorReport, ConsentInfo, FaceDetectionOptions,
} from 'proctorkit';
```

`ProctorEvent` is `{ type, at, ms, severity, context, data? }`; `Snapshot` is `{ kind: 'webcam' | 'screen', dataUrl, reason: 'interval' | 'event', at, ms, context }`; `CheckResult` is `{ ok, reason?, missing? }`; `ProctorReport` is `{ startedAt, endedAt, durationMs, pausedMs, awayMs, context, counts, events }`. Hover them in your editor for every field.

## Pauses and your timer

ProctorKit pauses the test by itself when the candidate leaves full screen, stops sharing the screen, loses the camera or plugs in a second display, and resumes it when the problem is fixed. It has no timer of its own; your page keeps the clock. Two ways to stay in step:

```js
// 1. Let ProctorKit do the arithmetic: the time used never includes a pause.
const LIMIT_MS = 30 * 60 * 1000;
setInterval(() => {
  const left = LIMIT_MS - proctor.activeMs();
  showCountdown(left);
  if (left <= 0) submitTest();
}, 500);

// 2. Or listen, and stop and start your own timer.
proctor.on('paused', (e) => { myTimer.stop(); });            // e.data.reason: fullscreen | screen | camera | display
proctor.on('resumed', (e) => { myTimer.start(); });          // e.data.pausedMs: how long this pause lasted
```

`paused` can fire more than once while the test is already paused, once per reason; `resumed` fires once, when every reason is cleared. `isBlocked()` is true for the whole time.

## Events

Every event has `type`, `at` (ISO time), `ms` (since `start()`), `severity` (`info`, `warn`, `high`), `context` and optional `data`.

| Type | Severity | Data |
| --- | --- | --- |
| `unsupported` | high | `missing` |
| `check_passed`, `check_failed` | info | `check` (`camera`, `face_detection`, `face_visible`, `screen_share`), `error` or `surface` |
| `consent_given` | info | `retentionDays` |
| `started`, `stopped` | info | |
| `cloud_connected` | info | `sessionId` (page key only) |
| `cloud_unavailable` | warn | `code` and `message`: the page key was refused (`key_invalid`, `key_off`, `domain_not_allowed`, `free_used`, `daily_cap`) or the service could not be reached. The test carries on with the on-device checks |
| `context_changed` | info | the values that changed |
| `paused`, `resumed` | info | `reason`, `pausedMs` |
| `fullscreen_exit` | warn | |
| `screen_share_stopped`, `camera_lost` | high | |
| `screen_share_resumed`, `camera_restored` | info | |
| `no_face` | warn | `seconds` with no face; the candidate is prompted |
| `face_returned` | info | `awayMs` |
| `screen_surface_unverified` | warn | the browser did not report what was shared |
| `extra_display` | warn before the test, high during | `phase` |
| `focus_lost` | warn | `sinceQuestionMs` |
| `focus_returned` | info, or warn after 5 s away | `awayMs` |
| `pointer_left_page` | info | `awayMs` |
| `copy_blocked`, `cut_blocked`, `paste_blocked`, `contextmenu_blocked` | info | `target` |
| `snapshot` | info | `kind`, `reason`, `bytes` (the image goes to `onSnapshot`) |
| `snapshot_upload_failed` | warn | |

Severity describes how much attention an event deserves, not guilt. Do not fail a candidate automatically on any of them.

## Headless mode

Set `ui: 'headless'` to render your own screens. `runChecks()` then tries each requirement once and returns the first that fails (`camera`, `screen_share`, `consent`, `extra_display`). Call `giveConsent()` when the candidate agrees, listen for `paused`, and call `retry(reason)` from your own button.

## Sending data to a backend

`cloud` posts JSON to two routes on `endpoint`:

- `POST {endpoint}/snapshot` with `{ token, kind, image, reason, at, ms, context, page }`, where `page` is the test page's title and host
- `POST {endpoint}/events` with `{ token, events }`

`sessionToken` must be a short-lived token your server issues for one session. Never put an API key in the page. Failed uploads are retried and then dropped with a `snapshot_upload_failed` event; a backend outage never stops the test.

### ProctorKit Cloud (hosted, optional)

[ProctorKit Cloud](https://proctorkit.com) stores the frames and gives you a dashboard and a private report link per candidate, laid out by question. Each key runs in one of two modes:

- **Record**: photos, screenshots and browser flags, for you to look through. Free during launch; afterwards 100 candidate sessions a month stay free, then $0.10 per session (₹5 in India).
- **Record + AI review**: AI checks every photo and screenshot (a phone in use, another person close by, another app on screen) and gives each session a 0 to 100 review priority: which candidates to look at first, not a test result. $0.25 per candidate session at launch price (list $0.40; ₹15 in India), first 50 free.

A candidate session is one person taking one test of up to 30 minutes; longer tests count by the minute (45 minutes is 1.5). The quickest start is a page key (`createProctor({ key })`, shown above). For paid volume, use a server key:

1. Your server creates a session with your server key: `POST https://proctorkit.com/api/v1/sessions` with `Authorization: Bearer pk_live_...` and `{ externalId, metadata }`. The response has `sessionToken`, `endpoint`, `settings`, `organisation`, `retentionDays`, `sessionId` and `reportUrl`.
2. Pass `endpoint`, `sessionToken` and `settings` to the page:

```js
const proctor = createProctor({
  cloud: { endpoint: s.endpoint, sessionToken: s.sessionToken },
  settings: s.settings,
  consent: { organisation: s.organisation, retentionDays: s.retentionDays },
});
```

3. Keep `reportUrl` on your server and give it to whoever reviews the candidate. Or read the result with `GET https://proctorkit.com/api/v1/sessions/{sessionId}`.

Every request and response, the flag types, limits and a prompt for coding agents are in the [docs](https://proctorkit.com/docs/). There is also a [demo you can try to cheat](https://proctorkit.com/demo/).

## Privacy

- Nothing is requested or recorded before `runChecks()`.
- The consent notice appears before the test and states what is captured, why, for how long and who sees it. Set `consent` so it is accurate for you.
- With no `cloud` setting, ProctorKit sends nothing anywhere. You are responsible for what your handlers store.
- Face counting happens on the candidate's device. The only network requests it makes are to download the MediaPipe files; host them yourself or set `faceDetection: false` to avoid those.
- The camera preview is hidden during the test by default. The consent notice says the camera stays on.
- You are responsible for meeting the privacy law that applies to you and your candidates.

## Development

```bash
npm install
npm run build    # dist/proctorkit.js, dist/proctorkit.global.js, type declarations
npm test         # headless Chromium with a fake camera (set PW_CHROME to use a system browser)
```

## Licence

MIT
