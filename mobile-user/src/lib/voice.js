// Voice search (what the Flutter wrapper's speech handler did for the Food search box).
// startVoiceSearch({ onPartial }) -> Promise<string> with the final transcript ('' if nothing was heard).
//
// Every run is its own session: events that belong to an earlier run (its late "end" after stop()) are ignored, the
// promise resolves as soon as a final result arrives (some Android phones send "end" late or never), and a safety
// timer ends a run that never starts or never finishes, so the caller's "Listening..." popup always closes.
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';

// The Google speech service may need several seconds to cold-start on a phone (it runs in the Google app's process).
const START_TIMEOUT_MS = 10000; // recognizer never said "start"
const MAX_RUN_MS = 20000; // hard cap for one run (start wait + listening)

let current = null; // { id, finish }
let seq = 0;

// Asked once per app run: each check is a round trip to the native side, and with the permission request they used to
// delay the recognizer (and its "listening" beep) on every tap of the mic.
let availableCache = null;
let permissionGranted = false;

export async function isVoiceSearchAvailable() {
  if (availableCache !== null) return availableCache;
  try {
    availableCache = Boolean(ExpoSpeechRecognitionModule.isRecognitionAvailable());
  } catch {
    availableCache = false;
  }
  return availableCache;
}

export async function startVoiceSearch({ lang = 'en-IN', onPartial } = {}) {
  if (!permissionGranted) {
    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perm.granted) {
      const err = new Error('Microphone permission denied');
      err.code = 'PERMISSION_DENIED';
      throw err;
    }
    permissionGranted = true;
  }
  // end the previous run (its listeners are removed now, so its late events cannot reach this one)
  current?.finish('');

  const id = ++seq;
  return new Promise((resolve, reject) => {
    let started = false;
    let lastPartial = '';
    let done = false;
    let ended = false; // the recognizer finished by itself: nothing to abort
    const subs = [];
    const timers = [];

    const finish = (text, error) => {
      if (done) return;
      done = true;
      subs.forEach((s) => s.remove());
      timers.forEach(clearTimeout);
      if (current?.id === id) current = null;
      // abort only a run that is still going (aborting one that has not started yet or has ended disconnects the
      // recognition service: "not connected to the recognition service" on the next start)
      if (started && !ended) {
        try {
          ExpoSpeechRecognitionModule.abort();
        } catch {
          // already stopped
        }
      }
      if (error) reject(error);
      else resolve(String(text || '').trim());
    };
    current = { id, finish };

    subs.push(
      ExpoSpeechRecognitionModule.addListener('start', () => {
        started = true;
      }),
      ExpoSpeechRecognitionModule.addListener('result', (e) => {
        const text = e.results?.[0]?.transcript || '';
        if (!text) return;
        if (e.isFinal) {
          ended = true;
          finish(text);
        } else {
          lastPartial = text;
          onPartial?.(text);
        }
      }),
      ExpoSpeechRecognitionModule.addListener('error', (e) => {
        ended = true;
        if (e.error === 'no-speech' || e.error === 'speech-timeout' || e.error === 'aborted') finish(lastPartial);
        else finish('', new Error(e.message || e.error));
      }),
      ExpoSpeechRecognitionModule.addListener('end', () => {
        // only an end after this run has started is ours
        if (started) {
          ended = true;
          finish(lastPartial);
        }
      }),
    );

    timers.push(
      setTimeout(() => {
        if (!started) finish(lastPartial);
      }, START_TIMEOUT_MS),
      setTimeout(() => finish(lastPartial), MAX_RUN_MS),
    );

    try {
      ExpoSpeechRecognitionModule.start({ lang, interimResults: true, continuous: false, maxAlternatives: 1 });
    } catch (err) {
      finish('', err);
    }
  });
}

export function stopVoiceSearch() {
  if (!current) return;
  try {
    ExpoSpeechRecognitionModule.stop();
  } catch {
    current?.finish('');
  }
}
