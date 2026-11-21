# Changelog

## 0.2.4

- The candidate is reminded to move back into view after 4 seconds out of frame (was 10), as an amber warning with an icon. `no_face` is still reported only after 10 seconds, so a candidate who moves back quickly is reminded, not flagged. New setting `absenceReportSec`; `absencePromptSec` now only sets the reminder.
- The reminder clears within about half a second of the candidate moving back (was up to 2 seconds or more): while no face is in view, the face check runs twice a second instead of every 2 seconds.

## 0.2.3

- README only: every example that uses a key names the test (`test: { id, name }`), and code blocks fit in 80 columns. No code changes.

## 0.2.2

- Fix: in apps built with a bundler (Next.js, webpack, Turbopack, Vite), the camera check failed with "The camera check could not be loaded". The face detector is loaded from a CDN at run time, and the published build had lost the markers that tell bundlers to leave that import alone. Pages that load `proctorkit.global.js` with a script tag were not affected.

## 0.2.1

- New event `page_closed` (warn): the tab was closed, reloaded or left while the test ran. It is sent as the page goes, so ProctorKit Cloud ends the session within about two minutes instead of waiting for the session token to expire.
- Shorter consent notice: "Video of your webcam and screen for the whole test, and when you leave the test window." It no longer gives the picture rate.

## 0.2.0

- **Session video.** The SDK now builds a video of the webcam and the screen for the whole test, in the browser: a picture about every 2 seconds, packed into one MP4 per half minute (Motion JPEG, no re-encoding). Clips go to the new `onClip` handler, or to ProctorKit Cloud with a key. Without `onClip`, a key or `cloud`, nothing is built. Turn it off with `clips: false`; tune it with `clips: { frameSec, windowSec }` or the `clipFrameSec`, `clipJitterSec` and `clipWindowSec` settings. Photos about every 10 seconds carry on as before.
- `clipFrames(mp4)` returns the JPEG pictures of a clip; `mjpegMp4(frames)` builds one.
- New events: `clip` and `clip_upload_failed`.
- The consent notice says plainly when the video is on.
- **With a page key, `candidate: { id, name }` is required** (`email` optional), so every report and dashboard row shows a real person. `test: { id, name }` is optional and groups candidates by test. `createProctor` throws if a page key is given without a candidate.
- `cloud` uploads clips to `POST {endpoint}/clip`.
- A query on the backend endpoint (such as a region hint) is kept on every upload route.
- Without a key, the consent notice states a retention period only if `consent.retentionDays` is set; otherwise it points candidates to the organisation's privacy notice.
- Installs straight from GitHub (`npm install github:aproli90/proctorkit#v0.2`), built on install.

## 0.1.0

First release.
