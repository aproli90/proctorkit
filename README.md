# ProctorKit

**Proctoring for the quiz you already built.**

[![npm](https://img.shields.io/npm/v/proctorkit)](https://www.npmjs.com/package/proctorkit) [![types](https://img.shields.io/npm/types/proctorkit)](#typescript) [![size](https://img.shields.io/bundlephobia/minzip/proctorkit)](https://bundlephobia.com/package/proctorkit) [![licence](https://img.shields.io/npm/l/proctorkit)](LICENSE)

One small browser library turns any web test into a proctored one: a system check, consent, full screen, entire-screen sharing, camera and face checks, a video of the webcam and the screen for the whole test, photos every 10 seconds, and an event log tied to each question. It pauses the test when something breaks and helps the candidate fix it. Free, MIT licensed, written in TypeScript, no dependencies, about 13 kB gzipped.

```js
import { createProctor } from 'proctorkit';

const proctor = createProctor({
  key: 'pk_pub_...',
  candidate: { id: 'c-1042', name: 'Asha Rao' },
  test: { id: 'sales-1', name: 'Sales screening' },
});
if ((await proctor.runChecks()).ok) proctor.start(); // on the Start button
// whenever the question changes
proctor.setContext({ questionId: 'Q1' });
// on submit: returns the session report
proctor.stop();
```

The key comes free from [proctorkit.com](https://proctorkit.com), which stores the recording and gives each candidate a report. No account? Leave out `key` and `candidate`, and keep everything yourself with `onEvent`, `onClip` and `onSnapshot` (see the [quick start](#quick-start)).

<p align="center"><img src="https://proctorkit.com/assets/proctorkit-demo.gif" alt="A candidate goes through the system check and consent, the test pauses when they leave full screen, and the reviewer's report shows each flagged moment next to its question" width="100%"></p>

> Status: 0.2, pre-release. The API may change before 1.0.

## Why teams use it

- **Keep your test.** It works on any web page you control: React, Vue, Svelte, Angular, a plain HTML form or a tool you built. Your questions, answers and scoring never pass through ProctorKit.
- **A ready interface, or none.** The built-in screens handle the system check, consent and pauses, with light and dark themes and every word replaceable. Or go headless and drive your own screens from events.
- **Fair to candidates.** Plain consent before anything is recorded, a pause screen with one button to fix each problem, and a timer that stops while the test is paused.
- **Evidence you can watch.** A video of the whole test, plus regular photos, so a reviewer sees what actually happened. Every clip, photo and event carries the question on screen at that moment.
- **Hard to get wrong.** It checks browser support up front, never hangs, and keeps the test running if an upload fails.
- **Private by default.** Nothing is captured before `runChecks()`, and nothing leaves the page except through your own handlers, or to ProctorKit Cloud when you pass a key.

## Everything in the free SDK

| Before the test | During the test | After the test |
| --- | --- | --- |
| Browser support check, with what is missing | Pauses on leaving full screen, stopping the share, losing the camera or adding a display, and resumes when fixed | A session report: duration, paused time, time away, counts per event type |
| Camera, with a preview for framing | Time away from the test window, per question | The full event log, each event with its question |
| Face in view, checked on the candidate's device | Prompts the candidate back into view | The video, photos and screenshots, tagged with their question |
| Entire-screen share required, window and tab shares refused | Copy, cut, paste and right-click blocked and logged | |
| Single display required (Chromium) | A video of the webcam and the screen, the whole way through | |
| Consent: what is recorded, why, for how long, who sees it | A photo and screenshot about every 10 seconds, plus extra ones when something happens | |
| | Pointer leaving the page | |

Plus, for developers: TypeScript types, ES module and script-tag builds, a headless mode, themes, replaceable text, every timing in one settings object, and `activeMs()` for a countdown that never counts a pause.

## Free SDK or ProctorKit Cloud

The SDK gives you the signals; what you do with them is up to you. [ProctorKit Cloud](https://proctorkit.com) is the optional hosted service for teams that would rather not build storage, review screens and checks themselves. Switching is one line: pass a key.

| | Free SDK | ProctorKit Cloud |
| --- | --- | --- |
| Everything in the table above | Yes | Yes |
| Where the video, photos and events go | Your handlers and your storage | Stored for you, deleted on schedule |
| A report per candidate, with the recording laid out by question | Build your own | Yes, with a private link for each reviewer |
| Results sent to your server when a session ends or its review is done | | Webhooks and a REST API |
| Your team: invite reviewers, one account per client, share a report by link | | Yes |
| Dashboard for your team, keys locked to your domains | | Yes |
| AI reviews each session and marks the moments worth a look: a phone in use, another person, another app on screen, the test hidden | | With AI review |
| Review priority from 0 to 100, so the riskiest sessions come first | | With AI review |
| Price | Free, forever | Recording only: free during launch. AI review: $0.25 per candidate session\* (₹15 in India), first 50 free |

```js
// the same proctor, now reporting to your dashboard
const proctor = createProctor({
  key: 'pk_pub_...',
  candidate: { id: user.id, name: user.name },
  test: { id: 'sales-1', name: 'Sales screening' },
});
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

React, with a page key from the [ProctorKit dashboard](https://proctorkit.com/app/?new) (results and reports in the dashboard). A page key needs to know who is taking the test: `candidate.id` and `candidate.name` are required, `email` is optional. Add `test: { id, name }` to group candidates by test; without it they are grouped under the key's name.

```jsx
import { useEffect, useState } from 'react';
import { createProctor } from 'proctorkit';

export function Quiz({ user, questions }) {
  // once per candidate: the dashboard and report show this person by name
  const [proctor] = useState(() =>
    createProctor({
      key: 'pk_pub_...',
      candidate: { id: user.id, name: user.name, email: user.email },
      test: { id: 'sales-1', name: 'Sales screening' },
    }),
  );
  const [started, setStarted] = useState(false);
  const [i, setI] = useState(0);

  const begin = async () => {
    // the Start button
    if ((await proctor.runChecks()).ok && proctor.start()) setStarted(true);
  };

  useEffect(() => {
    if (started) proctor.setContext({ questionId: questions[i].id });
  }, [started, i]);

  const submit = () => {
    proctor.stop(); // then save answers as before
  };
  // ...render the quiz once started
}
```

Without an account (free, nothing leaves the page except through your handlers): leave out `key` and take the events and the video yourself.

```js
const proctor = createProctor({
  consent: { organisation: 'Acme Hiring', retentionDays: 90 },
  onEvent: (event) => sendToYourServer(event),
  // a half-minute stretch of the session video, webcam or screen
  onClip: (clip) => uploadToYourStorage(clip.mp4),
  // optional: a photo about every 10 s as well
  onSnapshot: (snapshot) => uploadToYourStorage(snapshot.dataUrl),
});
// runChecks(), start(), setContext() and stop() work the same way
```

Plain HTML, no build step:

```html
<script src="https://cdn.jsdelivr.net/npm/proctorkit/dist/proctorkit.global.js"></script>
<script>
  const proctor = ProctorKit.createProctor({
    key: 'pk_pub_...',
    candidate: { id: 'c-1042', name: 'Asha Rao' },
    test: { id: 'sales-1', name: 'Sales screening' },
  });
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
| Session video | on when something receives it | A video of the webcam and of the screen, delivered as one MP4 per half minute to `onClip` or ProctorKit Cloud. Built from a picture about every 2 seconds (the moment varies by up to a second). Off without `onClip`, a key or `cloud`, so nothing is built that nobody receives |
| Webcam and screen photos | about every 10 s | JPEG data URLs to `onSnapshot`; the exact moment varies by a few seconds; extra photos when something happens |
| Question tagging | `setContext()` | Every event and frame carries the context at that moment |
| Session report | `stop()` | Totals, counts per event type, full event list |

Everything above runs in the browser, including building the video: no server-side processing is needed. The video, photos and events go only to your own handlers unless you pass a key or configure `cloud`.

## What it cannot do

Browser proctoring deters cheating and gives a reviewer evidence. It does not stop a determined cheat, and you should not present it as if it does.

- It sees only what the camera and the shared screen show, and it records no sound.
- It does not check who the candidate is.
- Everything runs on a page the candidate controls. Treat a clean log as "nothing was observed", not as proof.
- Phones and tablets cannot share their screen from the browser, so the default setup needs a desktop browser. Chrome and Edge give the fullest checks.

## Configuration

```ts
createProctor({
  require: {
    camera: true,
    screenShare: true,
    fullscreen: true,
    singleDisplay: true,
  },
  snapshots: { intervalSec: 10 }, // or false (also turns the video off)
  // the session video; or false for photos only
  clips: { frameSec: 2, windowSec: 30 },
  blockClipboard: true,
  consent: { organisation, retentionDays: 90, seenBy },
  ui: 'default', // or 'headless'
  theme: 'auto', // 'light' | 'dark' | 'auto'
  // setup preview only; true keeps it in the test, false hides it
  cameraTile: undefined,
  faceDetection: {}, // or false; see below
  settings: {}, // timings and thresholds; see below
  // replace any text; see defaultStrings
  strings: { pausedTitle: 'Test paused' },
  context: {},
  onEvent,
  onClip,
  onSnapshot,
  // optional: a page key from the ProctorKit dashboard
  key: 'pk_pub_...',
  // required with a page key: who is taking the test
  candidate: { id, name, email },
  // names the test in the dashboard; one key can serve many tests
  test: { id, name },
  // optional: a session your server created with a server key
  cloud: { endpoint, sessionToken },
  // where ProctorKit Cloud lives; leave unset
  apiBase: undefined,
});
```

Lightest setup, with no camera or screen share:

```js
createProctor({
  require: { camera: false, screenShare: false },
  snapshots: false,
});
```

### Settings

Every timing and threshold is in one object, `defaultSettings`. Pass only what you want to change:

| Setting | Default | Meaning |
| --- | --- | --- |
| `snapshotIntervalSec` | 10 | Seconds between regular frames |
| `snapshotJitterSec` | 3 | Each frame is taken up to this many seconds early or late |
| `clipFrameSec` | 2 | Seconds between the pictures that make up the video |
| `clipJitterSec` | 1 | Each video picture is taken up to this many seconds early or late |
| `clipWindowSec` | 30 | Seconds of the session in each clip |
| `hideCameraAfterSetup` | true | Show the camera preview during the system check only |
| `faceSetupWaitSec` | 12 | During setup, how long to wait for a face before asking the candidate to adjust |
| `absencePromptSec` | 4 | No face for this long: ask the candidate to move back into view |
| `absenceReportSec` | 10 | Still no face after this long: report `no_face` (moving back sooner is only a reminder) |
| `coverReportSec` | 3 | No face and a featureless picture, dark or red-lit (lens covered, or a very dark room), for this long: report `camera_blocked` |
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
// off
createProctor({ faceDetection: false });
// host the files yourself
createProctor({ faceDetection: { moduleUrl, wasmUrl, modelUrl } });
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
| `sessionId` | `string \| null` | The ProctorKit Cloud session's ID once a page key has connected. With a server key it stays `null` in the page: your server already has it from the create-session response |

## TypeScript

The package ships its declarations; nothing extra to install. Exported types:

```ts
import {
  createProctor,
  Proctor,
  defaultSettings,
  defaultStrings,
} from 'proctorkit';
import type {
  ProctorConfig,
  ProctorEvent,
  ProctorEventType,
  Severity,
  ProctorContext,
  ProctorSettings,
  Snapshot,
  Clip,
  Candidate,
  TestInfo,
  CheckResult,
  ProctorReport,
  ConsentInfo,
  FaceDetectionOptions,
} from 'proctorkit';
// clipFrames(mp4Bytes) gives back the JPEG pictures of a clip
import { clipFrames } from 'proctorkit';
```

`ProctorEvent` is `{ type, at, ms, severity, context, data? }`; `Snapshot` is `{ kind: 'webcam' | 'screen', dataUrl, reason: 'interval' | 'event', at, ms, context }`; `Clip` is `{ kind, startMs, endMs, frames, mp4, context }`, where `mp4` is a Blob that plays in any player that reads Motion JPEG; `CheckResult` is `{ ok, reason?, missing? }`; `ProctorReport` is `{ startedAt, endedAt, durationMs, pausedMs, awayMs, context, counts, events }`. Hover them in your editor for every field.

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
// e.data.reason: fullscreen | screen | camera | display
proctor.on('paused', (e) => {
  myTimer.stop();
});
// e.data.pausedMs: how long this pause lasted
proctor.on('resumed', (e) => {
  myTimer.start();
});
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
| `cloud_connected` | info | `sessionId` (page key only; with a server key your server has it) |
| `cloud_unavailable` | warn | `code` and `message`: the page key was refused (`key_invalid`, `key_off`, `domain_not_allowed`, `daily_cap`, `candidate_required`) or the service (`unavailable`) could not be reached. The test carries on with the on-device checks |
| `context_changed` | info | the values that changed |
| `paused`, `resumed` | info | `reason`, `pausedMs` |
| `fullscreen_exit` | warn | |
| `screen_share_stopped`, `camera_lost` | high | |
| `screen_share_resumed`, `camera_restored` | info | |
| `no_face` | warn | `seconds` with no face; the candidate is prompted |
| `camera_blocked` | high | `seconds`: no face and a dark, featureless picture, as when the lens is covered (or the room is very dark); the candidate is prompted. Reported instead of `no_face` |
| `camera_uncovered` | info | `coveredMs`: the picture came back |
| `face_returned` | info | `awayMs` |
| `screen_surface_unverified` | warn | the browser did not report what was shared |
| `extra_display` | warn before the test, high during | `phase` |
| `focus_lost` | warn | `sinceQuestionMs` |
| `focus_returned` | info, or warn after 5 s away | `awayMs` |
| `pointer_left_page` | info | `awayMs` |
| `page_closed` | warn | the tab was closed, reloaded or left while the test ran |
| `copy_blocked`, `cut_blocked`, `paste_blocked`, `contextmenu_blocked` | info | `target` |
| `snapshot` | info | `kind`, `reason`, `bytes` (the image goes to `onSnapshot`) |
| `snapshot_upload_failed` | warn | |
| `clip` | info | `kind`, `startMs`, `endMs`, `frames`, `bytes` (the video goes to `onClip`) |
| `clip_upload_failed` | warn | `kind`, `startMs`; the photos still cover that stretch |

Severity describes how much attention an event deserves, not guilt. Do not fail a candidate automatically on any of them.

## Headless mode

Set `ui: 'headless'` to render your own screens. `runChecks()` then tries each requirement once and returns the first that fails (`camera`, `screen_share`, `consent`, `extra_display`). Call `giveConsent()` when the candidate agrees, listen for `paused`, and call `retry(reason)` from your own button.

## Sending data to a backend

`cloud` posts to three routes on `endpoint`:

- `POST {endpoint}/clip?kind&startMs&endMs&frames&context` with the MP4 as the body (`Content-Type: video/mp4`) and the token in the `X-PK-Token` header
- `POST {endpoint}/snapshot` with `{ token, kind, image, reason, at, ms, context, page }`, where `page` is the test page's title and host
- `POST {endpoint}/events` with `{ token, events }`

`sessionToken` must be a short-lived token your server issues for one session. Never put an API key in the page. Failed uploads are retried and then dropped with a `snapshot_upload_failed` or `clip_upload_failed` event; a backend outage never stops the test.

### ProctorKit Cloud (hosted, optional)

[ProctorKit Cloud](https://proctorkit.com) stores the video and gives you a dashboard, candidates grouped by test, and a private report link per candidate, laid out by question. Each key runs in one of two modes:

- **Recording only**: the session video, photos and browser flags, for you to look through. Free during launch; afterwards 100 candidate sessions a month stay free, then $0.10 per session (₹5 in India).
- **AI review**: AI reviews each session (a phone in use, another person close by, another app on screen), marks the moments worth a look so you can jump straight to them, and gives each session a 0 to 100 review priority: which candidates to look at first, not a test result. You can mark any session clear or a concern yourself. $0.25 per candidate session at launch price (list $0.40; ₹15 in India), first 50 free.

A candidate session is one person taking one test of up to 30 minutes; longer tests count by the minute (45 minutes is 1.5). If your quiz has its own backend, use your account's server key (one for all your tests; it never reaches the page). If it is only a web page, use a page key per test (`createProctor({ key, candidate })`, shown above). With a server key:

1. Your server creates a session with your server key: `POST https://proctorkit.com/api/v1/sessions` with `Authorization: Bearer pk_live_...` and `{ candidate: { id, name, email }, test: { id, name }, aiReview, metadata }` (`candidate.id` and `candidate.name` are required; `test` tells your tests apart; `aiReview` chooses AI review or Recording only for this session). The response has `sessionToken`, `endpoint`, `settings`, `organisation`, `retentionDays`, `sessionId` and `reportUrl`.
2. Pass `endpoint`, `sessionToken` and `settings` to the page:

```js
const proctor = createProctor({
  cloud: { endpoint: s.endpoint, sessionToken: s.sessionToken },
  settings: s.settings,
  consent: { organisation: s.organisation, retentionDays: s.retentionDays },
});
```

3. Keep `reportUrl` on your server and give it to whoever reviews the candidate. Or read the result with `GET https://proctorkit.com/api/v1/sessions/{sessionId}`, list sessions with `GET /api/v1/sessions?candidateId=...`, download the recording with `GET /api/v1/sessions/{sessionId}/media`, or set your account's webhook (dashboard, **Account**) to be told when a session ends and when its review is done.

Every request and response, the flag types, limits and a prompt for coding agents are in the [docs](https://proctorkit.com/docs/). There is also a [demo you can try to cheat](https://proctorkit.com/demo/).

## Privacy

- Nothing is requested or recorded before `runChecks()`.
- Without a key you store the recording yourself, so the consent notice only states a retention period if you set `consent.retentionDays`; otherwise it points candidates to your privacy notice.
- When the session video is on, the consent notice says so in plain words: video of the webcam and the screen for the whole test.
- The consent notice appears before the test and states what is captured, why, for how long and who sees it. Set `consent` so it is accurate for you.
- With no `key` or `cloud` setting, ProctorKit sends nothing anywhere. You are responsible for what your handlers store.
- Face counting happens on the candidate's device. The only network requests it makes are to download the MediaPipe files; host them yourself or set `faceDetection: false` to avoid those.
- The camera preview is hidden during the test by default. The consent notice says the webcam is recorded for the whole test.
- You are responsible for meeting the privacy law that applies to you and your candidates.

## Troubleshooting

- **"Part of the camera check didn't download."** (`reason: 'face_detection'` in headless mode) The on-device face check's files could not be fetched: a slow or filtered network, or a Content Security Policy that blocks `cdn.jsdelivr.net` and `storage.googleapis.com`. It is not a camera problem. You can [host the files yourself](#face-detection).
- **"The camera check could not be loaded" on a good connection, before 0.2.2.** Some bundlers rewrote the SDK's on-demand import. Update: `npm install proctorkit@latest`.
- **Webhook signatures never match.** Sign the raw request body exactly as it arrived; parsing the JSON and stringifying it again changes the bytes. In Next.js read `await req.text()`, not `req.json()`.
- **`proctor.sessionId` is `null` with a server key.** Expected: your server has the ID from the create-session response.
- **The camera is requested twice.** More than one proctor was created. Create one per attempt, after the session (if any) has arrived; in React, `useState(() => createProctor(...))` in a component that mounts once.

Every message the candidate can see, with its `reason`: [proctorkit.com/docs#troubleshooting](https://proctorkit.com/docs/#troubleshooting). What changed in each version: [CHANGELOG.md](CHANGELOG.md).

## Development

```bash
npm install
npm run build    # dist/: the ES module, the script-tag build and the types
npm test         # headless Chromium, fake camera (PW_CHROME: a system browser)
```

Releases: a merge to `main` that changes `version` in `package.json` (with its `CHANGELOG.md` entry) stages that version on npm and creates its tag and GitHub release. A maintainer approves it on npmjs.com. No tags by hand.

## Licence

MIT
