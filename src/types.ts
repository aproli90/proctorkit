/** How much attention an event deserves. `info` is logged only; `warn` should be looked at; `high` should be reviewed first. */
export type Severity = 'info' | 'warn' | 'high';

/** Anything the host wants attached to events and snapshots, such as the question on screen. */
export type ProctorContext = Record<string, string | number | boolean | null>;

export type ProctorEventType =
  | 'unsupported' | 'check_passed' | 'check_failed' | 'consent_given'
  | 'started' | 'stopped' | 'context_changed' | 'cloud_connected' | 'cloud_unavailable'
  | 'paused' | 'resumed'
  | 'fullscreen_exit' | 'screen_share_stopped' | 'screen_share_resumed' | 'screen_surface_unverified'
  | 'camera_lost' | 'camera_restored' | 'virtual_camera' | 'camera_frozen'
  | 'no_face' | 'face_returned' | 'camera_blocked' | 'camera_uncovered'
  | 'extra_display'
  | 'focus_lost' | 'focus_returned' | 'pointer_left_page' | 'answer_after_focus_loss' | 'page_closed'
  | 'copy_blocked' | 'cut_blocked' | 'paste_blocked' | 'contextmenu_blocked'
  | 'snapshot' | 'snapshot_upload_failed' | 'clip' | 'clip_upload_failed';

export interface ProctorEvent {
  type: ProctorEventType;
  /** ISO time the event was recorded. */
  at: string;
  /** Milliseconds since `start()`; 0 for events before the test starts. */
  ms: number;
  severity: Severity;
  /** The context set with `setContext()` at that moment, for example `{ questionId: 'Q07' }`. */
  context: ProctorContext;
  data?: Record<string, unknown>;
}

export interface Snapshot {
  kind: 'webcam' | 'screen';
  /** JPEG as a data URL. Webcam frames are scaled to 600px on the longer side, screen frames to 1200px. */
  dataUrl: string;
  /** `interval` for the regular cadence, `event` for a frame taken because something happened. */
  reason: 'interval' | 'event';
  at: string;
  ms: number;
  context: ProctorContext;
}

/**
 * Half a minute of the test from the camera or the screen, as a short video: the frames taken every couple of
 * seconds, one per second of clip, so it plays faster than real time.
 */
export interface Clip {
  kind: 'webcam' | 'screen';
  /** Milliseconds since `start()` of the first and last frame. */
  startMs: number;
  endMs: number;
  /** Number of frames in the clip. */
  frames: number;
  /** The clip as an MP4 (Motion JPEG). `clipFrames()` turns it back into JPEG images. */
  mp4: Blob;
  /** The context when the clip started, for example the question on screen. */
  context: ProctorContext;
}

/** Who is taking the test. Required with a page key, so every report shows a real person. */
export interface Candidate {
  /** Your ID for this candidate. Attempts with the same ID are grouped together in the dashboard. */
  id: string;
  /** Shown in the dashboard and the report. */
  name: string;
  email?: string;
}

/** Which test this is, to group candidates in the dashboard. Optional; the key's name is used when left out. */
export interface TestInfo {
  id?: string;
  name?: string;
}

export interface ConsentInfo {
  /** Who is running the test, shown in the consent notice. */
  organisation?: string;
  /**
   * How long the recording is kept, shown in the consent notice. With a key, ProctorKit Cloud sets it. Without one,
   * set it to what your own storage really does; left out, the notice points candidates to your privacy notice
   * instead of promising a period.
   */
  retentionDays?: number;
  /** Who can see the data. Default: "Reviewers at <organisation>." */
  seenBy?: string;
}

export interface FaceDetectionOptions {
  /** ES module of `@mediapipe/tasks-vision`. Default: jsDelivr. Host it yourself if your content policy needs that. */
  moduleUrl?: string;
  /** Folder holding the MediaPipe `.wasm` files. Default: jsDelivr. */
  wasmUrl?: string;
  /** The face detector model file. Default: Google's public model storage. */
  modelUrl?: string;
  /** Detections below this confidence are ignored. Default 0.5. */
  minConfidence?: number;
  /** Use your own detector instead: return how many faces are in the video frame. */
  detect?: (video: HTMLVideoElement) => number | Promise<number>;
}

export interface ProctorConfig {
  /** What must be true before and during the test. Each defaults to `true`. */
  require?: {
    camera?: boolean;
    /** The candidate must share their entire screen (not a window or tab). */
    screenShare?: boolean;
    fullscreen?: boolean;
    /** Block the test while a second display is connected (Chromium only; ignored elsewhere). */
    singleDisplay?: boolean;
  };
  /** Regular webcam and screen frames. Set `false` to take none. */
  snapshots?: false | {
    /** Seconds between frames. Default 10. Same as `settings.snapshotIntervalSec`. */
    intervalSec?: number;
  };
  /**
   * The test as short clips: a frame every couple of seconds from the camera and the screen, packed into one
   * clip per half minute (see `Clip`). On by default; `false` keeps the photos only. Clips go to `onClip`
   * and, with a key or `cloud`, to the backend.
   */
  clips?: false | {
    /** Seconds between clip frames. Default 2. */
    frameSec?: number;
    /** Seconds of test per clip. Default 30. */
    windowSec?: number;
  };
  /** Timings and thresholds. Anything left out keeps its default; see `defaultSettings`. */
  settings?: Partial<import('./settings.js').ProctorSettings>;
  /**
   * Find the candidate's face on their own device. While it is on, the test cannot start until the
   * detector has loaded and a face is in view; during the test it prompts the candidate back into view
   * and reports `no_face`. It never reports other people. Set `false` to switch it off.
   */
  faceDetection?: false | FaceDetectionOptions;
  /** Block copy, cut, paste and the context menu on the page, and log each attempt. Default `true`. */
  blockClipboard?: boolean;
  consent?: ConsentInfo;
  /** `default` renders the system check, pause overlay and camera tile. `headless` renders nothing; drive it with events. */
  ui?: 'default' | 'headless';
  theme?: 'light' | 'dark' | 'auto';
  /**
   * The candidate's own camera preview. By default it is shown during the system check, so they can frame
   * themselves, and hidden during the test. `true` keeps it during the test; `false` never shows it.
   */
  cameraTile?: boolean;
  /** Replace any interface text. Keys are listed in `defaultStrings`. */
  strings?: Partial<Record<string, string>>;
  /** Initial context, for example `{ attempt: 2, section: 'reasoning' }`. */
  context?: ProctorContext;
  /** Called for every event as it happens. */
  onEvent?: (event: ProctorEvent) => void;
  /** Called with every photo. Use this to store photos yourself. */
  onSnapshot?: (snapshot: Snapshot) => void;
  /** Called with every clip, about every half minute per camera and screen. Use this to store clips yourself. */
  onClip?: (clip: Clip) => void;
  /** Who is taking the test. Required with `key`; with `cloud`, your server sends it when it creates the session. */
  candidate?: Candidate;
  /** Which test this is. Optional. */
  test?: TestInfo;
  /**
   * Send events and snapshots to a ProctorKit-compatible backend.
   * `sessionToken` must be a short-lived token issued by your server; never put an API key in the page.
   */
  cloud?: { endpoint: string; sessionToken: string };
  /**
   * Your page key (`pk_pub_...`) from the dashboard. The quickest way to start: the page opens its own session.
   * It works only on the domains listed on the key. Use `cloud` with a server-issued token instead for paid usage.
   */
  key?: string;
  /** Where the ProctorKit service lives. Leave unset. */
  apiBase?: string;
}

export interface CheckResult {
  ok: boolean;
  /** Why the checks did not pass. Absent when `ok` is true. */
  reason?: 'unsupported' | 'extra_display' | 'camera' | 'face_detection' | 'screen_share' | 'consent' | 'cancelled';
  /** Browser features that are missing, when `reason` is `unsupported`. */
  missing?: string[];
}

export interface ProctorReport {
  startedAt: string | null;
  endedAt: string | null;
  durationMs: number;
  /** Total time the test was paused behind the overlay. */
  pausedMs: number;
  /** Total time the test page was out of focus. */
  awayMs: number;
  context: ProctorContext;
  /** Number of events of each type. */
  counts: Partial<Record<ProctorEventType, number>>;
  events: ProctorEvent[];
}
