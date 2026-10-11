"use client";

/**
 * "Put it on your home screen" — the right instructions for the device
 * you're holding. Chromium browsers get a real Install button
 * (beforeinstallprompt); iPad/iPhone Safari gets the two taps it needs.
 */

import { useEffect, useState } from "react";
import { Check, Download, Share, SquarePlus } from "lucide-react";

type Platform = "ios" | "ios-other" | "chromium" | "mac-safari" | "other";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

function detect(): Platform {
  const ua = navigator.userAgent;
  const iPadOS = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  const ios = /iPad|iPhone|iPod/.test(ua) || iPadOS;
  if (ios) return /CriOS|FxiOS|EdgiOS/.test(ua) ? "ios-other" : "ios";
  if (/Chrome|Edg\//.test(ua)) return "chromium";
  if (/Safari/.test(ua) && /Macintosh/.test(ua)) return "mac-safari";
  return "other";
}

export function InstallCard() {
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [installed, setInstalled] = useState(false);
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);

  useEffect(() => {
    setPlatform(detect());
    setInstalled(
      window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true
    );
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) {
    return (
      <div className="hm-install">
        <div className="hm-install-done">
          <Check size={18} /> You&apos;re running Woodpecker as an app.
        </div>
        <a className="hm-btn hm-btn--ink" href="/notebook">Open notebook</a>
      </div>
    );
  }

  return (
    <div className="hm-install">
      {platform === "chromium" && (
        <>
          <p>Install it like any app — it opens full-screen, works offline, and lives in your dock.</p>
          <button
            className="hm-btn hm-btn--ink"
            disabled={!prompt}
            onClick={async () => {
              if (!prompt) return;
              await prompt.prompt();
              const { outcome } = await prompt.userChoice;
              if (outcome === "accepted") setInstalled(true);
              setPrompt(null);
            }}
          >
            <Download size={17} /> {prompt ? "Install Woodpecker" : "Open the notebook, then use ⋮ → Install"}
          </button>
        </>
      )}

      {(platform === "ios" || platform === "ios-other" || platform === "mac-safari" || platform === "other" || platform === null) && (
        <ol className="hm-steps">
          {platform === "ios-other" && (
            <li>
              <span className="hm-step-n">0</span>
              <span>Open this page in <strong>Safari</strong> — only Safari can add apps to the home screen.</span>
            </li>
          )}
          <li>
            <span className="hm-step-n">1</span>
            <span>
              Tap <Share size={16} className="hm-inline-ico" /> <strong>Share</strong>{" "}
              {platform === "mac-safari" ? "in the toolbar" : "(top right on iPad, bottom on iPhone)"}
            </span>
          </li>
          <li>
            <span className="hm-step-n">2</span>
            <span>
              Choose <SquarePlus size={16} className="hm-inline-ico" />{" "}
              <strong>{platform === "mac-safari" ? "Add to Dock" : "Add to Home Screen"}</strong>
            </span>
          </li>
          <li>
            <span className="hm-step-n">3</span>
            <span>Open Woodpecker from your home screen. It runs full-screen, no browser bars, Pencil-ready.</span>
          </li>
        </ol>
      )}
    </div>
  );
}
