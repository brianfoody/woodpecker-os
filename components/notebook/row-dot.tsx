"use client";

/**
 * The dot at the end of a line. It is the only way the agent ever speaks on
 * the page: a faint pulse while it reads, a busy little trio while it works,
 * a written answer, or a draft waiting for your tick.
 */

import { useEffect, useState } from "react";
import { Check, RotateCcw, X } from "lucide-react";
import type { Draft } from "@woodpeckeros/protocol";
import type { RowState } from "@/lib/notebook/model";

type Props = {
  state: RowState;
  x: number;
  y: number;
  pageWidth: number;
  open: boolean;
  onOpen: (open: boolean) => void;
  onApprove: (draft?: Draft) => void;
  onCancel: () => void;
  onRetry: () => void;
};

/** Writes text out a few characters at a time, like a pen catching up. */
function useWriteOn(text: string | undefined, speed = 22): string {
  const [shown, setShown] = useState(text ?? "");
  useEffect(() => {
    if (!text) {
      setShown("");
      return;
    }
    if (shown && text.startsWith(shown) && shown.length === text.length) return;
    let i = 0;
    setShown("");
    const id = setInterval(() => {
      i += 2;
      setShown(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, speed);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  return shown;
}

function shortAnswer(state: RowState): string | undefined {
  if (state.status === "answered") return state.draft?.summary;
  if (state.status === "done") return state.result;
  return undefined;
}

export function RowDot({ state, x, y, pageWidth, open, onOpen, onApprove, onCancel, onRetry }: Props) {
  const written = useWriteOn(shortAnswer(state));
  const [editing, setEditing] = useState<string | null>(null);

  useEffect(() => {
    if (!open) setEditing(null);
  }, [open]);

  if (state.status === "quiet") return null;

  const cardW = Math.min(380, pageWidth - 32);
  const cardLeft = Math.max(16, Math.min(x - 24, pageWidth - cardW - 16));
  const stop = (e: React.PointerEvent | React.MouseEvent) => e.stopPropagation();

  const toggle = () => onOpen(!open);

  return (
    <>
      <div
        className={`nb-dot nb-dot--${state.status}`}
        // Near the right edge, the dot's words drop under the line instead
        // of running off the page.
        style={
          pageWidth - x < 280 && ["answered", "ready", "done", "drafting", "running"].includes(state.status)
            ? { right: 16, top: y + 34 }
            : { left: x, top: y }
        }
        onPointerDown={stop}
        onClick={toggle}
        role="button"
        aria-label={state.title ?? "Assistant"}
      >
        {state.status === "reading" && <span className="nb-dot-core nb-dot-core--faint" />}

        {(state.status === "drafting" || state.status === "running") && (
          <>
            <span className="nb-trio" aria-hidden>
              <i />
              <i />
              <i />
            </span>
            <span className="nb-dot-label">
              {state.progress ?? (state.status === "running" ? "on it" : state.title ?? "thinking")}
            </span>
          </>
        )}

        {state.status === "answered" && (
          <>
            <span className="nb-dot-core" />
            <span className="nb-hand nb-answer" style={{ maxWidth: Math.max(80, pageWidth - x - 48) }}>
              {written}
            </span>
          </>
        )}

        {state.status === "ready" && (
          <>
            <span className="nb-dot-core nb-dot-core--ready" />
            <span className="nb-pill" style={{ maxWidth: Math.max(180, pageWidth - x - 40) }}>
              <span className="nb-pill-title">{state.draft?.summary ?? state.title}</span>
              <button
                className="nb-pill-btn nb-pill-btn--go"
                aria-label="Do it"
                onPointerDown={stop}
                onClick={(e) => {
                  e.stopPropagation();
                  onApprove();
                }}
              >
                <Check size={16} strokeWidth={3} />
              </button>
              <button
                className="nb-pill-btn"
                aria-label="Not this"
                onPointerDown={stop}
                onClick={(e) => {
                  e.stopPropagation();
                  onCancel();
                }}
              >
                <X size={15} strokeWidth={2.5} />
              </button>
            </span>
          </>
        )}

        {state.status === "done" && (
          <>
            <span className="nb-dot-core nb-dot-core--done">
              <Check size={10} strokeWidth={4} />
            </span>
            <span
              className="nb-hand nb-answer nb-answer--done"
              style={{ maxWidth: Math.max(80, pageWidth - x - 48) }}
            >
              {written}
            </span>
          </>
        )}

        {state.status === "cancelled" && <span className="nb-dot-core nb-dot-core--cancelled" />}
        {state.status === "error" && <span className="nb-dot-core nb-dot-core--error" />}
      </div>

      {open && state.status !== "reading" && (
        <div
          className="nb-card"
          style={{ left: cardLeft, top: y + 26, width: cardW }}
          onPointerDown={stop}
        >
          <div className="nb-card-kicker">
            {state.status === "drafting" && "Working on it"}
            {state.status === "answered" && "Found this"}
            {state.status === "ready" && "Ready when you are — nothing is sent until you tick"}
            {state.status === "running" && "Doing it now"}
            {state.status === "done" && "Done"}
            {state.status === "cancelled" && "Left alone"}
            {state.status === "error" && "Didn't work"}
          </div>
          <div className="nb-card-title">{state.draft?.summary ?? state.title ?? state.text}</div>

          {state.status === "error" && <p className="nb-card-body nb-card-body--err">{state.error}</p>}

          {state.draft && state.status !== "error" &&
            (editing !== null ? (
              <textarea
                className="nb-card-edit"
                value={editing}
                onChange={(e) => setEditing(e.target.value)}
                rows={8}
              />
            ) : (
              <div className="nb-card-body">{renderBody(state.draft.body)}</div>
            ))}

          <div className="nb-card-actions">
            {state.status === "ready" && (
              <>
                <button
                  className="nb-btn nb-btn--go"
                  onClick={() =>
                    onApprove(
                      editing !== null && state.draft
                        ? { ...state.draft, body: editing }
                        : undefined
                    )
                  }
                >
                  <Check size={16} strokeWidth={3} /> Go
                </button>
                {editing === null && state.draft && (
                  <button className="nb-btn" onClick={() => setEditing(state.draft!.body)}>
                    Edit
                  </button>
                )}
                <button className="nb-btn nb-btn--quiet" onClick={onCancel}>
                  Not this
                </button>
              </>
            )}
            {state.status === "answered" && (
              <>
                <button className="nb-btn" onClick={() => onOpen(false)}>
                  Thanks
                </button>
                <button className="nb-btn nb-btn--quiet" onClick={onCancel}>
                  Didn&apos;t want this
                </button>
              </>
            )}
            {state.status === "drafting" && (
              <button className="nb-btn nb-btn--quiet" onClick={onCancel}>
                Stop — I didn&apos;t ask
              </button>
            )}
            {(state.status === "cancelled" || state.status === "error") && (
              <button className="nb-btn" onClick={onRetry}>
                <RotateCcw size={14} /> {state.status === "error" ? "Try again" : "Actually, do it"}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/** Tiny markdown: bold, line breaks, bullets. Enough for drafts. */
function renderBody(body: string) {
  return body.split("\n").map((line, i) => {
    const bullet = /^\s*[-*•]\s+/.test(line);
    const text = line.replace(/^\s*[-*•]\s+/, "");
    const parts = text.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
      part.startsWith("**") && part.endsWith("**") ? (
        <strong key={j}>{part.slice(2, -2)}</strong>
      ) : (
        <span key={j}>{part.replace(/\*([^*]+)\*/g, "$1")}</span>
      )
    );
    if (!line.trim()) return <div key={i} className="nb-gap" />;
    return (
      <div key={i} className={bullet ? "nb-li" : undefined}>
        {parts}
      </div>
    );
  });
}
