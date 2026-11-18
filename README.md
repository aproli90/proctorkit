# ProctorKit

Proctoring you can add to any web quiz. One small browser library, no dependencies, no backend required.

ProctorKit runs a system check, gets the candidate's consent, keeps the test in full screen, makes sure the entire screen is shared, takes webcam and screen frames, and gives you a timestamped event log tied to the question on screen. It pauses the test when a requirement breaks and lets the candidate fix it. It flags; a person decides.

> Status: 0.1, pre-release. The API may change before 1.0.

## Free SDK or ProctorKit Cloud

This library is free and MIT licensed. On its own it runs in the candidate's browser and hands you the events and frames; storing them and looking through them is up to you. [ProctorKit Cloud](https://proctorkit.com) is the optional paid service built on it.

| | This SDK on its own | ProctorKit Cloud |
|---|---|---|
| System check, consent, full screen, entire-screen share, camera | Yes | Yes |
| Event log tied to each question, on-device face check | Yes | Yes |
| Where frames and events go | Your own handlers and storage | Stored for you |
| Report per candidate, dashboard, reviewers | Build your own | Included |
| AI review of every photo and screenshot, review priority | No | With Record + AI review |
| Setup | Your code | A page key in one line, or a server key |
| Price | Free | Record: free during launch. Record + AI review: ₹15 per candidate session, first 50 free. [Pricing](https://proctorkit.com/#pricing) |

To move to the Cloud later, [create a key](https://proctorkit.com/app/?new) and pass it as `key`; nothing else in your quiz changes. Try it first on the [demo](https://proctorkit.com/demo/), and see the [docs](https://proctorkit.com/docs/).

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

A complete page is in [`examples/basic.html`](examples/basic.html).

## What it does

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
| `requestCamera()`, `requestScreenShare()`, `giveConsent()` | | The individual steps, for headless hosts |

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

- **Record**: photos, screenshots and browser flags, for you to look through. Free during launch; afterwards 100 candidate sessions a month stay free, then ₹5 per session.
- **Record + AI review**: AI checks every photo and screenshot (a phone in use, another person close by, another app on screen) and gives each session a 0 to 100 review priority: which candidates to look at first, not a test result. ₹15 per candidate session at launch price (list ₹25), first 50 free.

A candidate session is one person taking one test of up to 30 minutes; longer tests count in proportion (45 minutes is 1.5). The quickest start is a page key (`createProctor({ key })`, shown above). For paid volume, use a server key:

1. Your server creates a session with your API key: `POST /v1/sessions` with `{ externalId, metadata }`. The response has `sessionToken`, `endpoint`, `settings`, `organisation`, `retentionDays`, `sessionId` and `reportUrl`.
2. Pass `endpoint`, `sessionToken` and `settings` to the page:

```js
const proctor = createProctor({
  cloud: { endpoint: s.endpoint, sessionToken: s.sessionToken },
  settings: s.settings,
  consent: { organisation: s.organisation, retentionDays: s.retentionDays },
});
```

3. Keep `reportUrl` on your server and give it to whoever reviews the candidate. Or read the result with `GET /v1/sessions/{sessionId}`.

Full steps, examples and a prompt for coding agents are in the [docs](https://proctorkit.com/docs/). There is also a [demo you can try to cheat](https://proctorkit.com/demo/).

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
