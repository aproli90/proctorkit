/**
 * Every timing and threshold the SDK uses, in one place. Pass any of them as `settings` in the config;
 * with a ProctorKit backend, pass the `settings` object from the create-session response unchanged.
 */
export interface ProctorSettings {
  /** Seconds between photos (kept as they are, and the backup if a clip is lost). */
  snapshotIntervalSec: number;
  /** Seconds between clip frames; 0 turns clips off. */
  clipFrameSec: number;
  /** Each clip frame is taken up to this many seconds early or late. */
  clipJitterSec: number;
  /** Seconds of test in one clip. */
  clipWindowSec: number;
  /** Frames are checked automatically by a backend. Only changes the consent wording; a backend sets it. */
  automatedChecks: boolean;
  /** Each frame is taken up to this many seconds early or late, so the moment cannot be predicted. */
  snapshotJitterSec: number;
  /** Show the camera preview during the system check only, not during the test. */
  hideCameraAfterSetup: boolean;
  /** With no face in view for this long, ask the candidate to move back. */
  absencePromptSec: number;
  /** Still no face after this long: report `no_face`. A candidate who moves back sooner is only reminded. */
  absenceReportSec: number;
  /** No face and a dark, featureless picture (lens covered, or a very dark room) for this long: report `camera_blocked`. */
  coverReportSec: number;
  /** During setup, how long to wait for the candidate's face before asking them to adjust. */
  faceSetupWaitSec: number;
  /** Seconds between on-device face checks. */
  faceCheckIntervalSec: number;
  /** Consecutive face checks that must see two or more faces before an extra frame is taken. */
  multipleFacesChecks: number;
  /** Identical consecutive webcam frames before the feed is reported as frozen. */
  frozenFeedFrames: number;
  /** Focus losses shorter than this are ignored (a notification, a permission prompt). */
  minFocusLossMs: number;
  /** A focus loss longer than this is `warn`; shorter is `info`. */
  longFocusLossSec: number;
  /** Moving to the next question this soon after returning from a long focus loss is reported. */
  fastAnswerSec: number;
  /** The pointer must be off the page this long before it is reported. */
  pointerAwayMinMs: number;
  /** Lower-case fragments of camera names that mean a software camera. */
  virtualCameraNames: string[];
}

export const defaultSettings: ProctorSettings = {
  snapshotIntervalSec: 10,
  clipFrameSec: 2,
  clipJitterSec: 1,
  clipWindowSec: 30,
  automatedChecks: false,
  snapshotJitterSec: 3,
  hideCameraAfterSetup: true,
  absencePromptSec: 4,
  absenceReportSec: 10,
  coverReportSec: 3,
  faceSetupWaitSec: 12,
  faceCheckIntervalSec: 2,
  multipleFacesChecks: 2,
  frozenFeedFrames: 3,
  minFocusLossMs: 800,
  longFocusLossSec: 5,
  fastAnswerSec: 8,
  pointerAwayMinMs: 1500,
  virtualCameraNames: ['obs', 'virtual', 'manycam', 'snap camera', 'droidcam', 'iriun', 'epoccam', 'xsplit', 'mmhmm', 'camo', 'ndi', 'splitcam', 'chromacam', 'e2esoft', 'vcam'],
};

/** Defaults with the host's values laid over them. Values of the wrong type are ignored. */
export function resolveSettings(given: unknown, legacyIntervalSec?: unknown): ProctorSettings {
  const out: ProctorSettings = { ...defaultSettings, virtualCameraNames: defaultSettings.virtualCameraNames.slice() };
  const src = (given && typeof given === 'object' ? given : {}) as Record<string, unknown>;
  for (const key of Object.keys(defaultSettings) as (keyof ProctorSettings)[]) {
    const v = src[key], d = defaultSettings[key];
    if (Array.isArray(d)) { if (Array.isArray(v)) (out[key] as string[]) = v.filter((x) => typeof x === 'string').map((x) => (x as string).toLowerCase()); }
    else if (typeof d === 'boolean') { if (typeof v === 'boolean') (out[key] as boolean) = v; }
    else if (typeof v === 'number' && isFinite(v) && v >= 0) (out[key] as number) = v;
  }
  const legacy = Number(legacyIntervalSec);
  if (legacy > 0) out.snapshotIntervalSec = legacy;
  out.snapshotIntervalSec = Math.max(2, out.snapshotIntervalSec);
  out.snapshotJitterSec = Math.min(out.snapshotJitterSec, out.snapshotIntervalSec / 2);
  out.faceCheckIntervalSec = Math.max(0.5, out.faceCheckIntervalSec);
  if (out.clipFrameSec) out.clipFrameSec = Math.max(1, out.clipFrameSec);
  out.clipJitterSec = Math.min(out.clipJitterSec, out.clipFrameSec / 2);
  out.clipWindowSec = Math.max(10, Math.min(120, out.clipWindowSec));
  out.frozenFeedFrames = Math.max(2, Math.round(out.frozenFeedFrames));
  out.multipleFacesChecks = Math.max(1, Math.round(out.multipleFacesChecks));
  return out;
}
