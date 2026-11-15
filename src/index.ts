import { ProctorUI, defaultStrings, type StepSpec } from './ui';
import type { CheckResult, ProctorConfig, ProctorContext, ProctorEvent, ProctorEventType, ProctorReport, Severity, Snapshot } from './types';

export type { CheckResult, ConsentInfo, ProctorConfig, ProctorContext, ProctorEvent, ProctorEventType, ProctorReport, Severity, Snapshot } from './types';
export { defaultStrings } from './ui';

type PauseReason = 'fullscreen' | 'screen' | 'camera' | 'display';
type Outcome = { ok: true } | { ok: false; error: string; fix: string };
type Listener = (event: ProctorEvent) => void;

const PAUSE_ORDER: PauseReason[] = ['display', 'camera', 'screen', 'fullscreen'];
const CLIPBOARD = ['copy', 'cut', 'paste', 'contextmenu'] as const;
const MIN_AWAY_MS = 800; // shorter focus blips (a notification, a permission prompt) are noise
const LONG_AWAY_MS = 5000;

/** Creates a proctor for one test session. Nothing is requested or recorded until `runChecks()` is called. */
export function createProctor(config: ProctorConfig = {}): Proctor {
  return new Proctor(config);
}

export class Proctor {
  private readonly need: { camera: boolean; screenShare: boolean; fullscreen: boolean; singleDisplay: boolean };
  private readonly intervalSec: number;
  private readonly s: Record<string, string>;
  private ui: ProctorUI | null = null;
  private listeners = new Map<string, Set<Listener>>();
  private events: ProctorEvent[] = [];
  private context: ProctorContext;

  private cam: MediaStream | null = null;
  private scr: MediaStream | null = null;
  private camV: HTMLVideoElement | null = null;
  private scrV: HTMLVideoElement | null = null;
  private consented = false;
  private running = false;
  private startedAt = 0;
  private endedAt = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private displayTimer: ReturnType<typeof setInterval> | null = null;

  private pauses = new Map<PauseReason, number>();
  private pausedSince = 0;
  private pausedMs = 0;
  private leftAt = 0;
  private awayMs = 0;
  private awayShot: ReturnType<typeof setTimeout> | null = null;

  private uploads: Snapshot[] = [];
  private uploading = 0;
  private outbox: ProctorEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly config: ProctorConfig = {}) {
    const r = config.require || {};
    this.need = { camera: r.camera !== false, screenShare: r.screenShare !== false, fullscreen: r.fullscreen !== false, singleDisplay: r.singleDisplay !== false };
    this.intervalSec = config.snapshots === false ? 0 : Math.max(2, Number(config.snapshots?.intervalSec) || 10);
    this.s = { ...defaultStrings };
    for (const [k, v] of Object.entries(config.strings || {})) if (typeof v === 'string') this.s[k] = v;
    this.context = { ...(config.context || {}) };
  }

  // ------------------------------------------------------------------ public API

  /** Listen for one event type, or `'*'` for all. Returns a function that removes the listener. */
  on(type: ProctorEventType | '*', listener: Listener): () => void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
    return () => { this.listeners.get(type)?.delete(listener); };
  }

  /** Merge values into the context attached to every later event and snapshot, for example `{ questionId: 'Q07' }`. */
  setContext(patch: ProctorContext): void {
    this.context = { ...this.context, ...patch };
    if (this.running) this.emit('context_changed', 'info', { ...patch });
  }

  /** Which required browser features are missing. Does not prompt the candidate. */
  support(): { ok: boolean; missing: string[] } {
    const missing: string[] = [];
    const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
    if (this.need.camera && !md?.getUserMedia) missing.push('camera');
    if (this.need.screenShare && !md?.getDisplayMedia) missing.push('screen-share');
    if (this.need.fullscreen && typeof document.documentElement.requestFullscreen !== 'function') missing.push('fullscreen');
    return { ok: missing.length === 0, missing };
  }

  /**
   * Runs the system check: browser support, single display, camera, entire-screen share, consent.
   * With the default UI it shows each step and resolves once all pass. In headless mode it tries
   * each requirement once and reports the first that fails; call it from a click handler.
   */
  async runChecks(): Promise<CheckResult> {
    const headless = this.config.ui === 'headless';
    const sup = this.support();
    if (!sup.ok) {
      this.emit('unsupported', 'high', { missing: sup.missing });
      if (!headless) void this.view().block(this.s.unsupported);
      return { ok: false, reason: 'unsupported', missing: sup.missing };
    }
    while (this.need.singleDisplay && extraDisplay()) {
      this.emit('extra_display', 'warn', { phase: 'checks' });
      if (headless) return { ok: false, reason: 'extra_display' };
      await this.view().block(this.s.extraDisplay, this.s.checkAgain);
    }
    if (headless) {
      if (this.need.camera && !live(this.cam) && !(await this.requestCamera()).ok) return { ok: false, reason: 'camera' };
      if (this.need.screenShare && !live(this.scr) && !(await this.requestScreenShare()).ok) return { ok: false, reason: 'screen_share' };
      return this.consented ? { ok: true } : { ok: false, reason: 'consent' };
    }
    const ui = this.view();
    const steps: StepSpec[] = [];
    if (this.need.camera && !live(this.cam)) steps.push({ id: 'camera', title: this.s.cameraTitle, render: (b, done) => ui.actionStep(b, this.s.cameraBody, this.s.cameraButton, () => this.requestCamera(), done) });
    if (this.need.screenShare && !live(this.scr)) steps.push({ id: 'screen', title: this.s.screenTitle, render: (b, done) => ui.actionStep(b, this.s.screenBody, this.s.screenButton, () => this.requestScreenShare(), done) });
    if (!this.consented) steps.push({ id: 'consent', title: this.s.consentTitle, render: (b, done) => ui.consentStep(b, this.consentFacts(), () => { this.giveConsent(); done(); }) });
    if (steps.length) await ui.runSteps(steps);
    return { ok: true };
  }

  /** Asks for the camera. Safe to call again after a failure or when the camera was lost. */
  async requestCamera(): Promise<Outcome> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 } }, audio: false });
      this.cam = stream;
      stream.getVideoTracks()[0]?.addEventListener('ended', () => { if (this.cam === stream) this.onCameraLost(); });
      if (this.camV) { this.camV.srcObject = stream; void this.camV.play().catch(noop); }
      if (this.running && this.config.cameraTile !== false) this.ui?.showCamera(stream);
      this.emit(this.running ? 'camera_restored' : 'check_passed', 'info', this.running ? undefined : { check: 'camera' });
      return { ok: true };
    } catch (e) {
      this.emit('check_failed', 'info', { check: 'camera', error: errName(e) });
      return { ok: false, error: this.s.cameraError, fix: this.s.cameraFix };
    }
  }

  /** Asks the candidate to share their entire screen. Rejects a window or tab share. Must be called from a click. */
  async requestScreenShare(): Promise<Outcome> {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: 'monitor' } as MediaTrackConstraints, audio: false });
    } catch (e) {
      this.emit('check_failed', 'info', { check: 'screen_share', error: errName(e) });
      return { ok: false, error: this.s.screenCancelled, fix: this.s.screenBody };
    }
    const track = stream.getVideoTracks()[0];
    const surface = (track?.getSettings?.() as { displaySurface?: string } | undefined)?.displaySurface;
    if (surface && surface !== 'monitor') {
      stream.getTracks().forEach((t) => t.stop());
      this.emit('check_failed', 'info', { check: 'screen_share', surface });
      return { ok: false, error: this.s.screenWrongSurface, fix: this.s.screenBody };
    }
    if (!surface) this.emit('screen_surface_unverified', 'warn'); // browser does not report what was shared
    this.scr = stream;
    track?.addEventListener('ended', () => { if (this.scr === stream) this.onScreenLost(); });
    // the capture element must follow the new stream, or later screen frames come from the dead one
    if (this.scrV) { this.scrV.srcObject = stream; void this.scrV.play().catch(noop); }
    this.emit(this.running ? 'screen_share_resumed' : 'check_passed', 'info', this.running ? undefined : { check: 'screen_share' });
    return { ok: true };
  }

  /** Record that the candidate agreed to the consent notice. The default UI calls this itself. */
  giveConsent(): void {
    if (this.consented) return;
    this.consented = true;
    this.emit('consent_given', 'info', { retentionDays: this.config.consent?.retentionDays ?? 90 });
  }

  /** True when every required stream is live and consent was given. */
  ready(): boolean {
    return this.consented && (!this.need.camera || live(this.cam)) && (!this.need.screenShare || live(this.scr));
  }

  /** Starts guarding and recording. Call it when the first question appears, after `runChecks()` passed. */
  start(): boolean {
    if (this.running) return true;
    if (!this.ready()) { console.warn('[proctorkit] start() called before the checks passed; call runChecks() first.'); return false; }
    this.running = true;
    this.startedAt = Date.now();
    this.endedAt = 0;
    this.emit('started', 'info', { require: this.need, intervalSec: this.intervalSec });

    if (this.cam) this.camV = feed(this.cam);
    if (this.scr) this.scrV = feed(this.scr);
    if (this.cam && this.config.cameraTile !== false && this.config.ui !== 'headless') this.view().showCamera(this.cam);

    document.addEventListener('fullscreenchange', this.onFullscreenChange);
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('blur', this.onLeft);
    window.addEventListener('focus', this.onBack);
    if (this.config.blockClipboard !== false) CLIPBOARD.forEach((t) => document.addEventListener(t, this.onClipboard, true));
    if (this.need.singleDisplay) this.displayTimer = setInterval(this.checkDisplay, 3000);
    if (this.intervalSec) {
      setTimeout(() => this.tick(), 1500); // first frames once the streams are producing
      this.timer = setInterval(() => this.tick(), this.intervalSec * 1000);
    }
    if (this.config.cloud) this.flushTimer = setInterval(() => void this.flushEvents(), 5000);

    if (this.need.fullscreen && !document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => this.pause('fullscreen'));
    }
    this.checkDisplay();
    return true;
  }

  /** Stops everything, releases the camera and screen, and returns the session report. */
  stop(): ProctorReport {
    if (this.running) {
      if (this.leftAt) this.onBack();
      if (this.pausedSince) { this.pausedMs += Date.now() - this.pausedSince; this.pausedSince = 0; }
      this.emit('stopped', 'info');
      this.running = false;
      this.endedAt = Date.now();
    }
    document.removeEventListener('fullscreenchange', this.onFullscreenChange);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('blur', this.onLeft);
    window.removeEventListener('focus', this.onBack);
    CLIPBOARD.forEach((t) => document.removeEventListener(t, this.onClipboard, true));
    for (const t of [this.timer, this.displayTimer, this.flushTimer]) if (t) clearInterval(t);
    if (this.awayShot) clearTimeout(this.awayShot);
    this.timer = this.displayTimer = this.flushTimer = this.awayShot = null;
    const cam = this.cam, scr = this.scr;
    this.cam = this.scr = this.camV = this.scrV = null; // cleared first so the 'ended' handlers do not treat this as a loss
    for (const st of [cam, scr]) st?.getTracks().forEach((t) => t.stop());
    this.pauses.clear();
    this.ui?.destroy(); this.ui = null;
    if (this.need.fullscreen && document.fullscreenElement) void document.exitFullscreen().catch(noop);
    void this.flushEvents(true);
    return this.getReport();
  }

  /** True while the system check or a pause overlay blocks the test. Freeze your own timers while this is true. */
  isBlocked(): boolean {
    return this.pauses.size > 0 || !!this.ui?.covering;
  }

  /** Why the test is paused right now, most important first. Empty when it is not paused. */
  pausedFor(): PauseReason[] {
    return PAUSE_ORDER.filter((r) => this.pauses.has(r));
  }

  /** Tries to fix one pause reason (headless hosts call this from their own button). */
  async retry(reason: PauseReason): Promise<boolean> {
    let ok = false;
    if (reason === 'fullscreen') ok = await document.documentElement.requestFullscreen().then(() => true, () => !!document.fullscreenElement);
    else if (reason === 'screen') ok = (await this.requestScreenShare()).ok;
    else if (reason === 'camera') ok = (await this.requestCamera()).ok;
    else ok = !extraDisplay();
    if (ok) this.unpause(reason);
    return ok;
  }

  /** The session so far: totals, counts per event type, and every event. */
  getReport(): ProctorReport {
    const counts: Partial<Record<ProctorEventType, number>> = {};
    for (const e of this.events) counts[e.type] = (counts[e.type] || 0) + 1;
    const end = this.endedAt || (this.running ? Date.now() : 0);
    return {
      startedAt: this.startedAt ? new Date(this.startedAt).toISOString() : null,
      endedAt: this.endedAt ? new Date(this.endedAt).toISOString() : null,
      durationMs: this.startedAt && end ? end - this.startedAt : 0,
      pausedMs: this.pausedMs + (this.pausedSince ? Date.now() - this.pausedSince : 0),
      awayMs: this.awayMs,
      context: { ...this.context },
      counts,
      events: this.events.slice(),
    };
  }

  // ------------------------------------------------------------------ internals

  private view(): ProctorUI {
    if (!this.ui) this.ui = new ProctorUI(this.s, this.config.theme || 'auto', this.config.badge !== false);
    return this.ui;
  }

  private consentFacts(): [string, string][] {
    const c = this.config.consent || {};
    const org = c.organisation || this.s.organisationFallback;
    const fill = (t: string) => t.replace('{organisation}', org).replace('{interval}', String(this.intervalSec)).replace('{days}', String(c.retentionDays ?? 90));
    const what = this.intervalSec && (this.need.camera || this.need.screenShare) ? this.s.consentWhat : this.s.consentWhatNoSnapshots;
    return [[this.s.labelWhat, fill(what)], [this.s.labelWhy, fill(this.s.consentWhy)], [this.s.labelKept, fill(this.s.consentKept)], [this.s.labelSeenBy, c.seenBy || fill(this.s.consentSeenBy)]];
  }

  private emit(type: ProctorEventType, severity: Severity, data?: Record<string, unknown>): ProctorEvent {
    const now = Date.now();
    const event: ProctorEvent = { type, at: new Date(now).toISOString(), ms: this.running && this.startedAt ? now - this.startedAt : 0, severity, context: { ...this.context } };
    if (data) event.data = data;
    this.events.push(event);
    if (this.config.cloud) { this.outbox.push(event); if (this.outbox.length > 500) this.outbox.shift(); }
    try { this.config.onEvent?.(event); } catch (e) { console.error('[proctorkit] onEvent threw', e); }
    for (const key of [type, '*']) for (const fn of this.listeners.get(key) || []) { try { fn(event); } catch (e) { console.error('[proctorkit] listener threw', e); } }
    return event;
  }

  private pause(reason: PauseReason): void {
    if (!this.running || this.pauses.has(reason)) return;
    const first = this.pauses.size === 0;
    this.pauses.set(reason, Date.now());
    if (first) { this.pausedSince = Date.now(); if (this.leftAt) this.leftAt = 0; }
    this.emit('paused', 'info', { reason });
    this.snap('event');
    this.showPause();
  }

  private unpause(reason: PauseReason): void {
    if (!this.pauses.delete(reason)) return;
    if (this.pauses.size === 0) {
      const ms = Date.now() - this.pausedSince;
      this.pausedMs += ms; this.pausedSince = 0;
      this.ui?.hidePause();
      this.emit('resumed', 'info', { pausedMs: ms });
      // leaving full screen often happens while fixing something else; put it back
      if (this.need.fullscreen && !document.fullscreenElement) this.pause('fullscreen');
    } else this.showPause();
  }

  private showPause(): void {
    if (this.config.ui === 'headless') return;
    const reason = this.pausedFor()[0];
    if (!reason) return;
    const text: Record<PauseReason, [string, string]> = {
      fullscreen: [this.s.pauseFullscreen, this.s.pauseFullscreenButton],
      screen: [this.s.pauseScreen, this.s.pauseScreenButton],
      camera: [this.s.pauseCamera, this.s.pauseCameraButton],
      display: [this.s.pauseDisplay, this.s.pauseDisplayButton],
    };
    this.view().showPause(text[reason][0], text[reason][1], () => void this.retry(reason));
  }

  private onFullscreenChange = (): void => {
    if (!this.need.fullscreen) return;
    if (document.fullscreenElement) this.unpause('fullscreen');
    else if (this.running) { this.emit('fullscreen_exit', 'warn'); this.pause('fullscreen'); }
  };

  private onScreenLost(): void {
    if (!this.running) return;
    this.emit('screen_share_stopped', 'high');
    if (this.need.screenShare) this.pause('screen');
  }

  private onCameraLost(): void {
    if (!this.running) return;
    this.emit('camera_lost', 'high');
    if (this.config.cameraTile !== false) this.ui?.showCamera(null);
    if (this.need.camera) this.pause('camera');
  }

  private checkDisplay = (): void => {
    if (!this.running || !this.need.singleDisplay) return;
    if (extraDisplay()) { if (!this.pauses.has('display')) { this.emit('extra_display', 'high', { phase: 'test' }); this.pause('display'); } }
    else this.unpause('display');
  };

  private onVisibility = (): void => { if (document.hidden) this.onLeft(); else this.onBack(); };

  private onLeft = (): void => {
    // our own overlays and the browser's permission prompts take focus; that is not the candidate leaving
    if (!this.running || this.leftAt || this.isBlocked()) return;
    this.leftAt = Date.now();
    this.awayShot = setTimeout(() => { if (this.leftAt) { this.emit('focus_lost', 'warn'); this.snap('event'); } }, MIN_AWAY_MS);
  };

  private onBack = (): void => {
    if (!this.leftAt) return;
    const ms = Date.now() - this.leftAt;
    this.leftAt = 0;
    if (this.awayShot) { clearTimeout(this.awayShot); this.awayShot = null; }
    if (ms < MIN_AWAY_MS) return;
    this.awayMs += ms;
    this.emit('focus_returned', ms >= LONG_AWAY_MS ? 'warn' : 'info', { awayMs: ms });
    this.snap('event');
  };

  private onClipboard = (e: Event): void => {
    e.preventDefault();
    this.emit(`${e.type}_blocked` as ProctorEventType, 'info', { target: (e.target as Element | null)?.tagName?.toLowerCase() });
  };

  private tick(): void {
    if (!this.running || this.pauses.size) return;
    this.snap('interval');
  }

  private snap(reason: Snapshot['reason']): void {
    if (!this.intervalSec) return;
    for (const [kind, video, edge] of [['webcam', this.camV, 600], ['screen', this.scrV, 1200]] as const) {
      if (!video || !video.videoWidth || !live(video.srcObject as MediaStream | null)) continue;
      let dataUrl: string;
      try {
        const k = edge / Math.max(video.videoWidth, video.videoHeight);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(video.videoWidth * k); canvas.height = Math.round(video.videoHeight * k);
        canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height);
        dataUrl = canvas.toDataURL('image/jpeg', 0.6);
      } catch { continue; }
      const ev = this.emit('snapshot', 'info', { kind, reason, bytes: Math.round(dataUrl.length * 0.75) });
      const shot: Snapshot = { kind, dataUrl, reason, at: ev.at, ms: ev.ms, context: ev.context };
      try { this.config.onSnapshot?.(shot); } catch (e) { console.error('[proctorkit] onSnapshot threw', e); }
      if (this.config.cloud) this.queueUpload(shot);
    }
  }

  // ---- optional backend. Failures never stop the test: frames are retried, then dropped and logged.

  private queueUpload(shot: Snapshot): void {
    this.uploads.push(shot);
    if (this.uploads.length > 20) { this.uploads.shift(); this.emit('snapshot_upload_failed', 'warn', { dropped: true }); }
    this.pump();
  }

  private pump(): void {
    const cloud = this.config.cloud;
    while (cloud && this.uploading < 2 && this.uploads.length) {
      const shot = this.uploads.shift()!;
      this.uploading++;
      void this.post(`${cloud.endpoint.replace(/\/$/, '')}/snapshot`, { token: cloud.sessionToken, kind: shot.kind, image: shot.dataUrl, reason: shot.reason, at: shot.at, ms: shot.ms, context: shot.context, page: { title: document.title, host: location.host } }, 3)
        .then((ok) => { if (!ok) this.emit('snapshot_upload_failed', 'warn', { kind: shot.kind, ms: shot.ms }); })
        .finally(() => { this.uploading--; this.pump(); });
    }
  }

  private async flushEvents(final = false): Promise<void> {
    const cloud = this.config.cloud;
    if (!cloud || !this.outbox.length) return;
    const batch = this.outbox.splice(0, 200);
    const ok = await this.post(`${cloud.endpoint.replace(/\/$/, '')}/events`, { token: cloud.sessionToken, events: batch }, final ? 1 : 2, final);
    if (!ok && !final) this.outbox.unshift(...batch);
  }

  private async post(url: string, body: unknown, attempts: number, keepalive = false): Promise<boolean> {
    for (let i = 0; i < attempts; i++) {
      try {
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive });
        if (res.ok) return true;
        if (res.status >= 400 && res.status < 500 && res.status !== 429) return false; // retrying will not help
      } catch { /* network error: retry */ }
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 1000 * 3 ** i));
    }
    return false;
  }
}

const noop = (): void => { /* ignored on purpose */ };
const live = (s: MediaStream | null): boolean => !!s && s.getVideoTracks().some((t) => t.readyState === 'live');
const errName = (e: unknown): string => (e && typeof e === 'object' && 'name' in e ? String((e as { name: unknown }).name) : 'Error');
const extraDisplay = (): boolean => (typeof screen !== 'undefined' && (screen as Screen & { isExtended?: boolean }).isExtended) === true;

function feed(stream: MediaStream): HTMLVideoElement {
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.srcObject = stream;
  void v.play().catch(noop);
  return v;
}
