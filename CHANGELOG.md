# Changelog

## 0.2.1

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
