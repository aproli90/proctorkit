import css from './styles.css';

export const defaultStrings: Record<string, string> = {
  checksTitle: 'Before you start',
  cameraTitle: 'Allow your camera',
  cameraBody: 'Your browser will ask for permission. Choose Allow.',
  cameraButton: 'Allow camera',
  cameraError: 'Camera access was denied.',
  cameraFix: 'Click "Allow camera" again, or allow it from the camera icon in the address bar first.',
  screenTitle: 'Share your entire screen',
  screenBody: 'Choose Entire screen, click the thumbnail, then Share.',
  screenButton: 'Share my screen',
  screenCancelled: 'Screen sharing was cancelled.',
  screenWrongSurface: 'That shared a window or tab.',
  consentTitle: 'Review what is recorded',
  consentWhat: 'Photos of your webcam and screen during the test, and when you leave the test window.',
  consentWhatVideo: 'Video of your webcam and screen for the whole test, and when you leave the test window.',
  consentWhatNoSnapshots: 'When you leave the test window or full screen, and copy or paste attempts.',
  consentWhy: 'So {organisation} can check the test was fair. A person reviews anything flagged.',
  consentWhyChecks: 'So {organisation} can check the test was fair. Automated checks flag moments; a person reviews them.',
  consentKept: '{days} days, then deleted.',
  consentKeptByHost: 'As set out in the privacy notice of {organisation}.',
  consentSeenBy: 'Reviewers at {organisation}.',
  consentCheckbox: 'I understand and agree to this for the length of the test.',
  consentButton: 'Start test',
  labelWhat: 'What', labelWhy: 'Why', labelKept: 'Kept for', labelSeenBy: 'Seen by',
  unsupported: 'This test needs a desktop browser that supports camera and screen sharing, such as Chrome or Edge. Open this link there.',
  extraDisplay: 'A second screen is connected. Disconnect it to continue.',
  checkAgain: 'Check again',
  pausedTitle: 'Test paused',
  pausedNote: 'Your timer has stopped.',
  pauseFullscreen: 'You left full screen. Return to continue.',
  pauseFullscreenButton: 'Return to full screen',
  pauseScreen: 'Screen sharing stopped. Resume sharing to continue.',
  pauseScreenButton: 'Resume sharing',
  pauseCamera: 'Your camera stopped. Turn it back on to continue.',
  pauseCameraButton: 'Turn camera on',
  pauseDisplay: 'A second screen is connected. Disconnect it to continue.',
  pauseDisplayButton: 'Check again',
  cameraOn: 'Camera on',
  cameraFraming: 'Keep your face in this picture',
  absencePrompt: 'Move back into view of your camera.',
  coverPrompt: 'Your camera is covered or too dark. Uncover it, or turn on a light.',
  working: 'Checking…',
  faceLoadError: "Part of the camera check didn't download.",
  faceLoadFix: 'Check your internet connection, then try again.',
  noFaceError: 'We could not see your face.',
  noFaceFix: 'Sit facing the camera so your face is in the picture, then try again.',
  cameraOff: 'Camera off',
  organisationFallback: 'the test organiser',
};

export interface StepSpec {
  id: 'camera' | 'screen' | 'consent';
  title: string;
  /** Builds the step body. Call `done()` when the step has passed. */
  render: (body: HTMLElement, done: () => void) => void;
}

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
};

/** The default interface: system check, pause overlay, camera tile. Rendered in a shadow root. */
export class ProctorUI {
  private host: HTMLElement;
  private root: ShadowRoot;
  private wrap: HTMLElement;
  private checks: HTMLElement | null = null;
  private pauseEl: HTMLElement | null = null;
  private cam: HTMLElement | null = null;
  private notice: HTMLElement | null = null;

  constructor(private s: Record<string, string>, theme: 'light' | 'dark' | 'auto') {
    this.host = h('div');
    this.host.setAttribute('data-proctorkit', '');
    const dark = theme === 'dark' || (theme === 'auto' && typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches);
    this.host.setAttribute('data-theme', dark ? 'dark' : 'light');
    this.root = this.host.attachShadow({ mode: 'open' });
    const style = h('style'); style.textContent = css;
    this.wrap = h('div', 'pk');
    this.root.append(style, this.wrap);
    // documentElement, not body: stays visible when the SDK puts the page into full screen
    document.documentElement.appendChild(this.host);
  }

  /** True while the system check or the pause overlay covers the page. */
  get covering(): boolean { return !!(this.checks || this.pauseEl); }

  /** Shows one blocking message with an optional retry button; resolves when retry is clicked. */
  block(message: string, retryLabel?: string): Promise<void> {
    this.closeChecks();
    const scrim = h('div', 'pk-scrim');
    const card = h('div', 'pk-pause');
    card.setAttribute('role', 'alertdialog');
    card.append(h('p', undefined, message));
    scrim.append(card);
    this.checks = scrim; this.wrap.append(scrim);
    return new Promise((resolve) => {
      if (!retryLabel) return; // nothing to retry: the host decides what happens next
      const btn = h('button', 'pk-btn', retryLabel); btn.type = 'button';
      btn.onclick = () => { this.closeChecks(); resolve(); };
      card.append(btn); btn.focus();
    });
  }

  /** Runs the steps one at a time; resolves when the last one passes. */
  runSteps(steps: StepSpec[]): Promise<void> {
    this.closeChecks();
    const scrim = h('div', 'pk-scrim');
    const panel = h('div', 'pk-panel');
    const list = h('div', 'pk-steps');
    list.setAttribute('role', 'dialog'); list.setAttribute('aria-label', this.s.checksTitle);
    list.append(h('div', 'pk-steps__title', this.s.checksTitle));
    const rows = steps.map((step, i) => {
      const row = h('div', 'pk-step is-todo');
      row.dataset.step = step.id;
      const mark = h('span', 'pk-step__mark', String(i + 1)); mark.setAttribute('aria-hidden', 'true');
      const body = h('div', 'pk-step__body');
      row.append(mark, h('span', 'pk-step__title', step.title), body);
      list.append(row);
      return { row, mark, body };
    });
    panel.append(list);
    scrim.append(panel);
    this.checks = scrim; this.wrap.append(scrim);
    return new Promise((resolve) => {
      const run = (i: number) => {
        if (i >= steps.length) { this.closeChecks(); resolve(); return; }
        const { row, mark, body } = rows[i];
        row.className = 'pk-step is-active';
        steps[i].render(body, () => { row.className = 'pk-step is-done'; mark.textContent = '✓'; run(i + 1); });
        (body.querySelector('button, input') as HTMLElement | null)?.focus();
      };
      run(0);
    });
  }

  /** A step body with a paragraph and one button that retries `action` until it succeeds. */
  actionStep(body: HTMLElement, text: string, label: string, action: () => Promise<{ ok: true } | { ok: false; error: string; fix: string }>, done: () => void): void {
    const err = h('p', 'pk-step__error'); err.hidden = true;
    const p = h('p', undefined, text);
    const btn = h('button', 'pk-btn', label); btn.type = 'button';
    btn.onclick = async () => {
      btn.disabled = true; btn.textContent = this.s.working;
      const r = await action();
      if (r.ok) { done(); return; }
      btn.disabled = false; btn.textContent = label;
      err.hidden = false; err.textContent = r.error; p.textContent = r.fix;
      (body.parentElement as HTMLElement).className = 'pk-step is-error';
      btn.focus();
    };
    body.append(err, p, btn);
  }

  consentStep(body: HTMLElement, facts: [string, string][], onAgree: () => void): void {
    const dl = h('dl', 'pk-consent__list');
    for (const [k, v] of facts) dl.append(h('dt', undefined, k), h('dd', undefined, v));
    const label = h('label', 'pk-check');
    const box = h('input'); box.type = 'checkbox';
    label.append(box, h('span', undefined, this.s.consentCheckbox));
    const btn = h('button', 'pk-btn', this.s.consentButton); btn.type = 'button'; btn.disabled = true;
    box.onchange = () => { btn.disabled = !box.checked; };
    btn.onclick = () => { if (box.checked) onAgree(); };
    body.append(dl, label, btn);
  }

  closeChecks(): void { this.checks?.remove(); this.checks = null; }

  showPause(message: string, buttonLabel: string, onClick: () => void): void {
    this.hidePause();
    const scrim = h('div', 'pk-scrim');
    const card = h('div', 'pk-pause');
    card.setAttribute('role', 'alertdialog'); card.setAttribute('aria-label', this.s.pausedTitle);
    const bars = h('span', 'pk-pause__bars'); bars.setAttribute('aria-hidden', 'true');
    const btn = h('button', 'pk-btn', buttonLabel); btn.type = 'button'; btn.onclick = onClick;
    card.append(bars, h('h2', undefined, this.s.pausedTitle), h('p', undefined, message), btn, h('p', 'pk-small', this.s.pausedNote));
    scrim.append(card);
    this.pauseEl = scrim; this.wrap.append(scrim);
    btn.focus();
  }

  hidePause(): void { this.pauseEl?.remove(); this.pauseEl = null; }

  /** `setup` lifts the preview above the system check and labels it as a framing aid. */
  showCamera(stream: MediaStream | null, setup = false): void {
    if (!this.cam) {
      this.cam = h('div', 'pk-cam');
      const v = h('video'); v.muted = true; v.playsInline = true; v.autoplay = true;
      this.cam.append(v, h('span', 'pk-cam__status'));
      this.wrap.append(this.cam);
    }
    const v = this.cam.querySelector('video') as HTMLVideoElement;
    v.srcObject = stream;
    if (stream) v.play().catch(() => { /* autoplay may wait for a gesture */ });
    this.cam.classList.toggle('is-off', !stream);
    this.cam.classList.toggle('is-setup', setup);
    (this.cam.querySelector('.pk-cam__status') as HTMLElement).textContent = !stream ? this.s.cameraOff : setup ? this.s.cameraFraming : this.s.cameraOn;
  }

  hideCamera(): void { this.cam?.remove(); this.cam = null; }

  /** A small message that does not block the test. */
  showNotice(text: string, tone: 'info' | 'warn' = 'info'): void {
    if (!this.notice) { this.notice = h('div', 'pk-notice'); this.wrap.append(this.notice); }
    this.notice.className = 'pk-notice' + (tone === 'warn' ? ' pk-notice--warn' : '');
    this.notice.setAttribute('role', tone === 'warn' ? 'alert' : 'status');
    this.notice.replaceChildren();
    if (tone === 'warn') {
      // a camera with a line through it
      const icon = h('span', 'pk-notice__icon');
      icon.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 16v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10"/><path d="M1 1l22 22"/></svg>';
      this.notice.append(icon);
    }
    this.notice.append(document.createTextNode(text));
  }

  hideNotice(): void { this.notice?.remove(); this.notice = null; }

  destroy(): void { this.host.remove(); this.checks = this.pauseEl = this.cam = this.notice = null; }
}
