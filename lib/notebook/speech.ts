/**
 * Push-to-talk dictation via the browser's own speech recognition
 * (Safari/iPadOS, Chrome, Edge). Free, on-device or vendor-hosted by the
 * browser — nothing goes through Woodpecker. Interim results stream so the
 * words appear on the page as you say them.
 */

type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
};

function ctor(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function speechSupported(): boolean {
  return ctor() !== null;
}

export type Dictation = {
  /** Stop listening; resolves with the final transcript. */
  stop(): Promise<string>;
  cancel(): void;
};

export function startDictation(opts: {
  onText: (text: string, final: boolean) => void;
  onError?: (message: string) => void;
}): Dictation | null {
  const Ctor = ctor();
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = navigator.language || "en-US";

  let finalText = "";
  let interim = "";
  let ended = false;
  let resolveEnd: ((text: string) => void) | null = null;

  const current = () => (finalText + " " + interim).replace(/\s+/g, " ").trim();

  rec.onresult = (e: any) => {
    interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += " " + r[0].transcript;
      else interim += " " + r[0].transcript;
    }
    opts.onText(current(), false);
  };
  rec.onerror = (e: any) => {
    const code = e?.error ?? "unknown";
    if (code === "no-speech" || code === "aborted") return;
    opts.onError?.(
      code === "not-allowed"
        ? "Microphone blocked — allow it in your browser settings."
        : `Couldn't hear that (${code}).`
    );
  };
  rec.onend = () => {
    ended = true;
    const text = current();
    opts.onText(text, true);
    resolveEnd?.(text);
  };

  try {
    rec.start();
  } catch {
    return null;
  }

  return {
    stop() {
      if (ended) return Promise.resolve(current());
      return new Promise((resolve) => {
        resolveEnd = resolve;
        try {
          rec.stop();
        } catch {
          resolve(current());
        }
        // Safari occasionally never fires onend — don't hang the UI.
        setTimeout(() => resolve(current()), 1500);
      });
    },
    cancel() {
      try {
        rec.abort();
      } catch {
        // already stopped
      }
    },
  };
}
