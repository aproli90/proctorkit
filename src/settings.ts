/**
 * Every timing and threshold the SDK uses, in one place. Pass any of them as `settings` in the config;
 * with a ProctorKit backend, pass the `settings` object from the create-session response unchanged.
 */
export interface ProctorSettings {
  /** Seconds between regular frames. */
  snapshotIntervalSec: number;
  /** Each frame is taken up to this many seconds early or late, so the moment cannot be predicted. */
  snapshotJitterSec: number;
  /** Show the camera preview during the system check only, not during the test. */
  hideCameraAfterSetup: boolean;
  /** With no face in view for this long, ask the candidate to move back. */
  absencePromptSec: number;
  /** Seconds between on-device face checks. */
  faceCheckIntervalSec: number;
  /** Consecutive face checks that must see two or more faces before `multiple_faces` is reported. */
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
  snapshotJitterSec: 3,
  hideCameraAfterSetup: true,
  absencePromptSec: 10,
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
  out.frozenFeedFrames = Math.max(2, Math.round(out.frozenFeedFrames));
  out.multipleFacesChecks = Math.max(1, Math.round(out.multipleFacesChecks));
  return out;
}
