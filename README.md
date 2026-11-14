# ProctorKit

Proctoring you can add to any web quiz. One small browser library, no dependencies, no backend required.

ProctorKit runs a system check, gets the candidate's consent, keeps the test in full screen, makes sure the entire screen is shared, takes webcam and screen frames, and gives you a timestamped event log tied to the question on screen. It pauses the test when a requirement breaks and lets the candidate fix it. It flags; a person decides.

> Status: 0.1, pre-release. The API may change before 1.0.

## Install

```bash
npm install proctorkit
```

or with a script tag (global `ProctorKit`):

```html
<script src="https://cdn.jsdelivr.net/npm/proctorkit/dist/proctorkit.global.js"></script>
```

## Quick start

```js
import { createProctor } from 'proctorkit';

const proctor = createProctor({
  consent: { organisation: 'Acme Hiring', retentionDays: 90 },
  context: { candidateId: 'c_123', testId: 'sales-screening' },
  onEvent: (event) => console.log(event.type, event),
  onSnapshot: (snapshot) => { /* store snapshot.dataUrl yourself */ },
});

startButton.onclick = async () => {
  const result = await proctor.runChecks();   // system check + consent
  if (!result.ok) return;                     // result.reason says why
  proctor.setContext({ questionId: 'Q01' });
  proctor.start();                            // when the first question appears
};

// whenever the question changes
proctor.setContext({ questionId: 'Q02' });

// freeze your own timers while a check or pause overlay is up
if (proctor.isBlocked()) { /* do not count this time */ }

// at the end
const report = proctor.stop();
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
| Webcam and screen frames | every 10 s | JPEG data URLs; extra frames when something happens |
| Question tagging | `setContext()` | Every event and frame carries the context at that moment |
| Session report | `stop()` | Totals, counts per event type, full event list |

Everything above runs in the browser. Frames and events go only to your own `onEvent` and `onSnapshot` handlers unless you configure `cloud`.

## What it cannot do

Browser proctoring deters casual cheating and produces evidence for a reviewer. It does not stop a determined cheat, and you should not present it as if it does.

- It cannot see a phone or a person outside the camera frame.
- Some screen-overlay tools do not appear in a shared screen.
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
  cameraTile: true,
  badge: true,
  strings: { pausedTitle: 'Test paused' },   // replace any text; see defaultStrings
  context: {},
  onEvent, onSnapshot,
  cloud: { endpoint, sessionToken },   // optional backend, see below
});
```

Lightest setup, with no camera or screen share:

```js
createProctor({ require: { camera: false, screenShare: false }, snapshots: false });
```

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
| `retry(reason)` | `Promise<boolean>` | Tries to fix one pause reason (for headless hosts) |
| `getReport()` | `ProctorReport` | The report so far, without stopping |
| `support()` | `{ ok, missing }` | Missing browser features, without prompting |
| `requestCamera()`, `requestScreenShare()`, `giveConsent()` | | The individual steps, for headless hosts |

## Events

Every event has `type`, `at` (ISO time), `ms` (since `start()`), `severity` (`info`, `warn`, `high`), `context` and optional `data`.

| Type | Severity | Data |
| --- | --- | --- |
| `unsupported` | high | `missing` |
| `check_passed`, `check_failed` | info | `check`, `error` or `surface` |
| `consent_given` | info | `retentionDays` |
| `started`, `stopped` | info | |
| `context_changed` | info | the values that changed |
| `paused`, `resumed` | info | `reason`, `pausedMs` |
| `fullscreen_exit` | warn | |
| `screen_share_stopped`, `camera_lost` | high | |
| `screen_share_resumed`, `camera_restored` | info | |
| `screen_surface_unverified` | warn | the browser did not report what was shared |
| `extra_display` | warn before the test, high during | `phase` |
| `focus_lost` | warn | |
| `focus_returned` | info, or warn after 5 s away | `awayMs` |
| `copy_blocked`, `cut_blocked`, `paste_blocked`, `contextmenu_blocked` | info | `target` |
| `snapshot` | info | `kind`, `reason`, `bytes` (the image goes to `onSnapshot`) |
| `snapshot_upload_failed` | warn | |

Severity describes how much attention an event deserves, not guilt. Do not fail a candidate automatically on any of them.

## Headless mode

Set `ui: 'headless'` to render your own screens. `runChecks()` then tries each requirement once and returns the first that fails (`camera`, `screen_share`, `consent`, `extra_display`). Call `giveConsent()` when the candidate agrees, listen for `paused`, and call `retry(reason)` from your own button.

## Sending data to a backend

`cloud` posts JSON to two routes on `endpoint`:

- `POST {endpoint}/snapshot` with `{ token, kind, image, reason, at, ms, context }`
- `POST {endpoint}/events` with `{ token, events }`

`sessionToken` must be a short-lived token your server issues for one session. Never put an API key in the page. Failed uploads are retried and then dropped with a `snapshot_upload_failed` event; a backend outage never stops the test.

A hosted backend with stored evidence, automated checks on each frame and a reviewer dashboard is in development.

## Privacy

- Nothing is requested or recorded before `runChecks()`.
- The consent notice appears before the test and states what is captured, why, for how long and who sees it. Set `consent` so it is accurate for you.
- With no `cloud` setting, ProctorKit sends nothing anywhere. You are responsible for what your handlers store.
- You are responsible for meeting the privacy law that applies to you and your candidates.

## For candidates

If a test you are taking says "Proctored by ProctorKit":

- You are shown what will be recorded and must agree before the test starts.
- Your camera and screen are captured as still frames at intervals, only for the length of the test. Recording stops when the test ends.
- If the test pauses, the message tells you what to do, and your timer is stopped while it is paused.
- Flags are reviewed by a person at the organisation running your test. Questions about your data go to that organisation.

## Development

```bash
npm install
npm run build    # dist/proctorkit.js, dist/proctorkit.global.js, type declarations
npm test         # headless Chromium with a fake camera (set PW_CHROME to use a system browser)
```

## Licence

MIT
