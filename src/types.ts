/** How much attention an event deserves. `info` is logged only; `warn` should be looked at; `high` should be reviewed first. */
export type Severity = 'info' | 'warn' | 'high';

/** Anything the host wants attached to events and snapshots, such as the question on screen. */
export type ProctorContext = Record<string, string | number | boolean | null>;

export type ProctorEventType =
  | 'unsupported' | 'check_passed' | 'check_failed' | 'consent_given'
  | 'started' | 'stopped' | 'context_changed'
  | 'paused' | 'resumed'
  | 'fullscreen_exit' | 'screen_share_stopped' | 'screen_share_resumed' | 'screen_surface_unverified'
  | 'camera_lost' | 'camera_restored'
  | 'extra_display'
  | 'focus_lost' | 'focus_returned'
  | 'copy_blocked' | 'cut_blocked' | 'paste_blocked' | 'contextmenu_blocked'
  | 'snapshot' | 'snapshot_upload_failed';

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

export interface ConsentInfo {
  /** Who is running the test, shown in the consent notice. */
  organisation?: string;
  /** How long snapshots are kept, shown in the consent notice. Default 90. */
  retentionDays?: number;
  /** Who can see the data. Default: "Reviewers at <organisation>." */
  seenBy?: string;
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
    /** Seconds between frames. Default 10. */
    intervalSec?: number;
  };
  /** Block copy, cut, paste and the context menu on the page, and log each attempt. Default `true`. */
  blockClipboard?: boolean;
  consent?: ConsentInfo;
  /** `default` renders the system check, pause overlay and camera tile. `headless` renders nothing; drive it with events. */
  ui?: 'default' | 'headless';
  theme?: 'light' | 'dark' | 'auto';
  /** Show the candidate their own camera in a small tile. Default `true`. */
  cameraTile?: boolean;
  /** Show "Proctored by ProctorKit" on the system check. Default `true`. */
  badge?: boolean;
  /** Replace any interface text. Keys are listed in `defaultStrings`. */
  strings?: Partial<Record<string, string>>;
  /** Initial context, for example `{ candidateId: 'c_123', testId: 'physio-screening' }`. */
  context?: ProctorContext;
  /** Called for every event as it happens. */
  onEvent?: (event: ProctorEvent) => void;
  /** Called with every frame. Use this to store frames yourself. */
  onSnapshot?: (snapshot: Snapshot) => void;
  /**
   * Send events and snapshots to a ProctorKit-compatible backend.
   * `sessionToken` must be a short-lived token issued by your server; never put an API key in the page.
   */
  cloud?: { endpoint: string; sessionToken: string };
}

export interface CheckResult {
  ok: boolean;
  /** Why the checks did not pass. Absent when `ok` is true. */
  reason?: 'unsupported' | 'extra_display' | 'camera' | 'screen_share' | 'consent' | 'cancelled';
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
