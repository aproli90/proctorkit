// On-device face counting. The model runs in the candidate's browser; no frame leaves the page for it.
// The MediaPipe runtime and model are loaded only when a test starts, from the URLs below or the host's own.
import type { FaceDetectionOptions } from './types';

const VERSION = '1.2.3';
export const faceDefaults = {
  moduleUrl: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/vision_bundle.mjs`,
  wasmUrl: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/wasm`,
  modelUrl: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
};

export interface FaceCounter {
  /** Number of faces in the current video frame. */
  count(video: HTMLVideoElement): number | Promise<number>;
  close(): void;
}

type Detector = { detectForVideo(v: HTMLVideoElement, t: number): { detections: unknown[] }; close(): void };

export async function loadFaceCounter(opts: FaceDetectionOptions = {}): Promise<FaceCounter> {
  if (typeof opts.detect === 'function') { const detect = opts.detect; return { count: (v) => detect(v), close: () => { /* host-owned */ } }; }
  const moduleUrl = opts.moduleUrl || faceDefaults.moduleUrl;
  // the URL is only known at run time, so bundlers must leave this import alone
  const lib = await import(/* webpackIgnore: true */ /* @vite-ignore */ moduleUrl) as {
    FilesetResolver: { forVisionTasks(url: string): Promise<unknown> };
    FaceDetector: { createFromOptions(fileset: unknown, o: unknown): Promise<Detector> };
  };
  const fileset = await lib.FilesetResolver.forVisionTasks(opts.wasmUrl || faceDefaults.wasmUrl);
  const detector = await lib.FaceDetector.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: opts.modelUrl || faceDefaults.modelUrl, delegate: 'CPU' },
    runningMode: 'VIDEO',
    minDetectionConfidence: opts.minConfidence ?? 0.5,
  });
  let last = 0;
  return {
    count: (video) => { const t = Math.max(last + 1, performance.now()); last = t; return detector.detectForVideo(video, t).detections.length; },
    close: () => { try { detector.close(); } catch { /* already closed */ } },
  };
}
