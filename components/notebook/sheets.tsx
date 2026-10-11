"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Cloud, Copy, Laptop, Mic, Trash2, X } from "lucide-react";
import QRCode from "qrcode";
import type { LearningEntry } from "@woodpeckeros/protocol";
import { pairingUrl, type Pairing } from "@woodpeckeros/protocol";
import type { ConnectorClient, ConnectorInfo, ConnectorStatus } from "@/lib/connector-client";
import { startDictation, speechSupported, type Dictation } from "@/lib/notebook/speech";
import { rasterizeStrokes, strokePath, normalisePressure } from "@/lib/notebook/ink";
import { newId, type Point, type Stroke } from "@/lib/notebook/model";
import { APP_URL, startHostedAgent } from "@/lib/notebook/cloud";

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

export function Sheet({
  title,
  subtitle,
  onClose,
  children,
  wide,
}: {
  title: string;
  subtitle?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="nb-scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`nb-sheet${wide ? " nb-sheet--wide" : ""}`} role="dialog" aria-label={title}>
        <button className="nb-sheet-x" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
        <h2 className="nb-sheet-title">{title}</h2>
        {subtitle && <p className="nb-sheet-sub">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}

export function CopyLine({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="nb-copy"
      onClick={() => {
        void navigator.clipboard?.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      }}
    >
      <code>{text}</code>
      {copied ? <Check size={15} /> : <Copy size={15} />}
    </button>
  );
}

/** Press and hold to talk; words stream in as you speak. */
export function HoldToTalk({
  label,
  onText,
  onFinal,
}: {
  label: string;
  onText: (text: string) => void;
  onFinal?: (text: string) => void;
}) {
  const [live, setLive] = useState(false);
  const dict = useRef<Dictation | null>(null);
  const [supported, setSupported] = useState(true);
  useEffect(() => setSupported(speechSupported()), []);

  if (!supported) return null;

  const begin = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dict.current = startDictation({ onText: (t) => onText(t) });
    if (dict.current) setLive(true);
  };
  const end = async () => {
    const d = dict.current;
    dict.current = null;
    setLive(false);
    if (d) onFinal?.(await d.stop());
  };

  return (
    <button
      className={`nb-talk${live ? " nb-talk--live" : ""}`}
      onPointerDown={begin}
      onPointerUp={end}
      onPointerCancel={end}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Mic size={18} />
      {live ? "Listening… let go when done" : label}
    </button>
  );
}

/** A small ruled pad for writing a short answer by hand. */
function ScribblePad({ onChange }: { onChange: (strokes: Stroke[]) => void }) {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const live = useRef<Point[] | null>(null);
  const liveEl = useRef<SVGPathElement>(null);
  const svg = useRef<SVGSVGElement>(null);

  const at = (e: React.PointerEvent): Point => {
    const r = svg.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top, normalisePressure(e.pointerType, e.pressure)];
  };

  return (
    <svg
      ref={svg}
      className="nb-scribble"
      onPointerDown={(e) => {
        (e.target as Element).setPointerCapture(e.pointerId);
        live.current = [at(e)];
      }}
      onPointerMove={(e) => {
        if (!live.current) return;
        live.current.push(at(e));
        liveEl.current?.setAttribute("d", strokePath({ points: live.current, size: 0.8 }, true));
      }}
      onPointerUp={() => {
        if (!live.current) return;
        const next = [...strokes, { id: newId(), points: live.current, row: 0, size: 0.8 }];
        live.current = null;
        liveEl.current?.setAttribute("d", "");
        setStrokes(next);
        onChange(next);
      }}
    >
      {strokes.map((s) => (
        <path key={s.id} d={strokePath(s)} className="nb-ink-path" />
      ))}
      <path ref={liveEl} className="nb-ink-path" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Why not? — the teaching moment after a cancel
// ---------------------------------------------------------------------------

const QUICK_REASONS = [
  "I'll do this one myself",
  "Just a note to self",
  "Not now",
  "Wrong idea",
];

export function WhySheet({
  lineText,
  onSubmit,
  onClose,
}: {
  lineText: string;
  onSubmit: (reason: string | undefined, reasonImage?: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [mode, setMode] = useState<"talk" | "write">("talk");
  const [ink, setInk] = useState<Stroke[]>([]);

  const send = (r?: string) => {
    const image = !r && mode === "write" && ink.length ? rasterizeStrokes(ink) ?? undefined : undefined;
    onSubmit(r?.trim() || undefined, image);
  };

  return (
    <Sheet
      title="Got it. Why not?"
      subtitle={
        <>
          For <em className="nb-hand-inline">&ldquo;{lineText}&rdquo;</em>. Your answer teaches
          Woodpecker when to stay quiet next time.
        </>
      }
      onClose={() => onSubmit(undefined)}
    >
      <div className="nb-chips">
        {QUICK_REASONS.map((r) => (
          <button key={r} className="nb-chip" onClick={() => send(r)}>
            {r}
          </button>
        ))}
      </div>

      <div className="nb-seg">
        <button className={mode === "talk" ? "is-on" : ""} onClick={() => setMode("talk")}>
          Say it
        </button>
        <button className={mode === "write" ? "is-on" : ""} onClick={() => setMode("write")}>
          Write it
        </button>
      </div>

      {mode === "talk" ? (
        <>
          <HoldToTalk label="Hold to say why" onText={setReason} />
          <textarea
            className="nb-input"
            placeholder="…or type it"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
          />
        </>
      ) : (
        <ScribblePad onChange={setInk} />
      )}

      <div className="nb-sheet-actions">
        <button className="nb-btn nb-btn--quiet" onClick={() => onSubmit(undefined)}>
          Skip
        </button>
        <button
          className="nb-btn nb-btn--go"
          disabled={mode === "talk" ? !reason.trim() : ink.length === 0}
          onClick={() => {
            send(mode === "talk" ? reason : undefined);
            onClose();
          }}
        >
          Teach it
        </button>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// What it has learned
// ---------------------------------------------------------------------------

export function LearnedSheet({
  client,
  onClose,
}: {
  client: ConnectorClient | null;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<LearningEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!client) return;
    client
      .listLearning()
      .then(setEntries)
      .catch((e) => setError(e instanceof Error ? e.message : "Agent offline"));
  }, [client]);

  return (
    <Sheet
      title="What it has learned"
      subtitle="Every tick and every “not this” — with your reasons — shapes when it steps in. It lives with your agent, and you can forget anything here."
      onClose={onClose}
    >
      {error && <p className="nb-muted">{error}</p>}
      {!error && entries === null && <p className="nb-muted">Asking your agent…</p>}
      {entries && entries.length === 0 && (
        <p className="nb-muted">Nothing yet. Wave off a suggestion and tell it why — that&apos;s how it learns.</p>
      )}
      <ul className="nb-learned">
        {entries?.map((e) => (
          <li key={e.id}>
            <span className={`nb-verdict nb-verdict--${e.verdict}`}>
              {e.verdict === "approved" ? "✓" : "✕"}
            </span>
            <div>
              <div className="nb-hand-inline">{e.text}</div>
              {e.reason && <div className="nb-muted">“{e.reason}”</div>}
            </div>
            <button
              className="nb-icon-btn"
              aria-label="Forget"
              onClick={() => {
                client?.forgetLearning(e.id);
                setEntries((list) => list?.filter((x) => x.id !== e.id) ?? null);
              }}
            >
              <Trash2 size={15} />
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Agent setup — cloud (recommended) or this computer
// ---------------------------------------------------------------------------

function useQr(text: string | null): string | null {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    if (!text) return setSvg(null);
    QRCode.toString(text, { type: "svg", margin: 1, color: { dark: "#1d1b16", light: "#ffffff" } })
      .then(setSvg)
      .catch(() => setSvg(null));
  }, [text]);
  return svg;
}

export function AgentSheet({
  client,
  status,
  info,
  onClose,
}: {
  client: ConnectorClient | null;
  status: ConnectorStatus;
  info: ConnectorInfo | null;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"hosted" | "local">("hosted");
  const [invite, setInvite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [pasted, setPasted] = useState("");

  // Already paired? Show that pairing's QR so another device can join.
  useEffect(() => {
    if (pairing || status !== "connected") return;
    try {
      const raw = localStorage.getItem("woodpecker-pairing");
      if (raw) setPairing(JSON.parse(raw) as Pairing);
    } catch {
      // local dev / no stored pairing
    }
  }, [status, pairing]);

  const link = useMemo(() => (pairing ? pairingUrl(APP_URL, pairing) : null), [pairing]);
  const qr = useQr(link);

  const start = async () => {
    setBusy(true);
    setError(null);
    const res = await startHostedAgent(invite);
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setPairing(res.pairing);
    client?.adoptPairing(res.pairing);
  };

  if (status === "connected" && info) {
    return (
      <Sheet title="Your agent" onClose={onClose}>
        <div className="nb-agent-card">
          <span className="nb-live-dot" />
          <div>
            <div className="nb-agent-name">
              {info.mode === "cloud" ? "Woodpecker Cloud" : info.hostname}
            </div>
            <div className="nb-muted">
              v{info.connectorVersion} · {info.mode === "cloud" ? "always on" : "on your computer"} · Claude{" "}
              {info.auth === "ok" ? "connected" : "not connected"}
            </div>
          </div>
        </div>
        {link && qr && (
          <div className="nb-qr-row">
            <div className="nb-qr" dangerouslySetInnerHTML={{ __html: qr }} />
            <p className="nb-muted">
              Scan to open this notebook on your iPad, already connected. Treat it like a password.
            </p>
          </div>
        )}
        <div className="nb-sheet-actions">
          <button
            className="nb-btn nb-btn--quiet"
            onClick={() => {
              if (confirm("Disconnect this device from the agent?")) {
                client?.forgetPairing();
                onClose();
              }
            }}
          >
            Disconnect this device
          </button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet
      wide
      title="Give your notebook an agent"
      subtitle="Woodpecker reads along through a Claude agent of your own. We run it for you in the cloud, so it's always on and nothing needs to stay open on your laptop."
      onClose={onClose}
    >
      <div className="nb-seg nb-seg--big">
        <button className={tab === "hosted" ? "is-on" : ""} onClick={() => setTab("hosted")}>
          <Cloud size={16} /> Woodpecker Cloud <span className="nb-tag">beta</span>
        </button>
        <button className={tab === "local" ? "is-on" : ""} onClick={() => setTab("local")}>
          <Laptop size={16} /> My own computer
        </button>
      </div>

      {tab === "hosted" && !pairing && (
        <div className="nb-steps">
          <p>
            We start a private agent just for you: its own container, its own storage. Then you
            connect your Claude Pro or Max plan, and it runs on that.
          </p>
          <label className="nb-field">
            <span>Invite code</span>
            <input
              className="nb-input"
              placeholder="woodpecker-…"
              autoCapitalize="off"
              autoCorrect="off"
              value={invite}
              onChange={(e) => setInvite(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && invite.trim() && void start()}
            />
          </label>
          {error && <p className="nb-error">{error}</p>}
          <button className="nb-btn nb-btn--go nb-btn--wide" disabled={!invite.trim() || busy} onClick={start}>
            <Cloud size={16} /> {busy ? "Starting your agent…" : "Start my agent"}
          </button>
        </div>
      )}

      {tab === "hosted" && pairing && (
        <div className="nb-steps">
          <div className="nb-wait">
            <span className={`nb-live-dot${status === "connected" ? "" : " nb-live-dot--wait"}`} />
            {status === "connected" ? "Your agent is online" : "Your agent is waking up — a few seconds…"}
          </div>
          {qr && (
            <div className="nb-qr-row">
              <div className="nb-qr" dangerouslySetInnerHTML={{ __html: qr }} />
              <p className="nb-muted">
                Writing on an iPad? Scan this there to open your notebook already connected. Treat it like
                a password.
              </p>
            </div>
          )}
          <p className="nb-muted">Next we&apos;ll ask you to connect your Claude account.</p>
        </div>
      )}

      {tab === "local" && (
        <div className="nb-steps">
          <p>Prefer to keep everything on your own machine? Run this (Node 20+ with Claude Code signed in), then scan the QR it prints:</p>
          <CopyLine text="npx @woodpeckeros/connect" />
          <p className="nb-muted">Your notebook only works while that computer is awake.</p>
          <label className="nb-field">
            <span>Or paste the pairing link it printed</span>
            <input
              className="nb-input"
              placeholder="https://woodpeckeros.com/pair#…"
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
            />
          </label>
          <button
            className="nb-btn"
            disabled={!pasted.includes("#")}
            onClick={() => {
              window.location.href = `/pair${pasted.slice(pasted.indexOf("#"))}`;
            }}
          >
            Connect
          </button>
        </div>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Claude credential for a fresh cloud agent
// ---------------------------------------------------------------------------

export function CredentialSheet({
  client,
  onClose,
}: {
  client: ConnectorClient | null;
  onClose: () => void;
}) {
  const [type, setType] = useState<"oauth-token" | "api-key">("oauth-token");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async () => {
    if (!client) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await client.setCredential(type, value);
      if (res.ok) onClose();
      else setMessage(res.message ?? "That didn't work.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Agent offline");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      title="Connect your Claude account"
      subtitle="Your agent runs on your own Claude plan. The token is encrypted on this device and sent straight to your agent, where it's stored on your agent's private volume."
      onClose={onClose}
    >
      <div className="nb-seg">
        <button className={type === "oauth-token" ? "is-on" : ""} onClick={() => setType("oauth-token")}>
          Claude Pro / Max
        </button>
        <button className={type === "api-key" ? "is-on" : ""} onClick={() => setType("api-key")}>
          API key
        </button>
      </div>
      {type === "oauth-token" ? (
        <div className="nb-steps">
          <p>On any computer with Claude Code installed, run:</p>
          <CopyLine text="claude setup-token" />
          <p className="nb-muted">It opens a browser to sign in, then prints a token starting with sk-ant-oat. Paste it here.</p>
        </div>
      ) : (
        <p className="nb-muted">
          Create one at console.anthropic.com → API keys. Usage is billed to that key.
        </p>
      )}
      <input
        className="nb-input"
        type="password"
        autoComplete="off"
        placeholder={type === "oauth-token" ? "sk-ant-oat01-…" : "sk-ant-api03-…"}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      {message && <p className="nb-error">{message}</p>}
      <div className="nb-sheet-actions">
        <button className="nb-btn nb-btn--go" disabled={!value.trim() || busy} onClick={submit}>
          {busy ? "Checking with Claude…" : "Connect"}
        </button>
      </div>
    </Sheet>
  );
}
