"use client";

/**
 * Woodpecker notebook — a ruled page that reads along.
 *
 * Input model (iPad-first):
 *  - Apple Pencil writes. Once a pencil has been seen, a finger scrolls.
 *  - Without a pencil (laptop, phone), a finger or mouse writes.
 *  - Press and HOLD anywhere (still, ~half a second) to talk: your words
 *    stream onto the page where you pressed. Let go to finish.
 *  - Two fingers always scroll. Zig-zag over ink to scratch it out.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Eraser,
  Mic,
  PenLine,
  Sparkles,
  Undo2,
} from "lucide-react";
import type { Draft } from "@woodpeckeros/protocol";
import {
  getConnectorClient,
  type ConnectorClient,
  type ConnectorInfo,
  type ConnectorStatus,
} from "@/lib/connector-client";
import {
  isScratchOut,
  normalisePressure,
  strokeHit,
  strokePath,
  strokeRow,
} from "@/lib/notebook/ink";
import {
  MARGIN_X,
  PAGE_TOP,
  ROW_H,
  emptyPage,
  newId,
  nextFreeRow,
  rowAt,
  rowEndX,
  rowTop,
  todayKey,
  type Page,
  type Point,
  type RowState,
  type Stroke,
  type TextBlock,
} from "@/lib/notebook/model";
import { startDictation, speechSupported, type Dictation } from "@/lib/notebook/speech";
import { useAmbient } from "./use-ambient";
import { RowDot } from "./row-dot";
import { AgentSheet, CredentialSheet, LearnedSheet, WhySheet } from "./sheets";

const HOLD_MS = 480;
const HOLD_SLOP = 7;
const STORAGE_PREFIX = "woodpecker-notebook:";

type Tool = "pen" | "eraser";
type Sheet = null | "agent" | "credential" | "learned" | { why: number };

function loadPage(date: string): Page {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + date);
    if (raw) return JSON.parse(raw) as Page;
  } catch {
    // fall through
  }
  return emptyPage(date);
}

function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return todayKey(new Date(y, m - 1, d + days));
}

function prettyDate(date: string): { day: string; rest: string } {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return {
    day: dt.toLocaleDateString(undefined, { weekday: "long" }),
    rest: dt.toLocaleDateString(undefined, { day: "numeric", month: "long" }),
  };
}

export default function Notebook() {
  const [date, setDate] = useState(() => todayKey());
  const [page, setPageState] = useState<Page>(() => emptyPage(todayKey()));
  const pageRef = useRef(page);
  const [loaded, setLoaded] = useState(false);
  const [tool, setTool] = useState<Tool>("pen");
  const [sheet, setSheet] = useState<Sheet>(null);
  const [openDot, setOpenDot] = useState<number | null>(null);
  const [width, setWidth] = useState(800);
  const [voice, setVoice] = useState<{ x: number; y: number; level: "listening" | "unsupported" } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [client, setClient] = useState<ConnectorClient | null>(null);
  const [status, setStatus] = useState<ConnectorStatus>("unpaired");
  const [info, setInfo] = useState<ConnectorInfo | null>(null);

  const undoStack = useRef<Array<Pick<Page, "strokes" | "texts">>>([]);
  const viewport = useRef<HTMLDivElement>(null);
  const pageEl = useRef<HTMLDivElement>(null);
  const livePath = useRef<SVGPathElement>(null);
  const scrollY = useRef(0);

  // ---- connector ----------------------------------------------------------
  useEffect(() => {
    const c = getConnectorClient();
    setClient(c);
    const a = c.subscribeStatus(setStatus);
    const b = c.subscribeInfo(setInfo);
    return () => {
      a();
      b();
    };
  }, []);
  const connected = status === "connected";

  // Arriving from the landing page's "Deploy my agent".
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("setup")) {
      setSheet("agent");
      window.history.replaceState(null, "", "/notebook");
    }
  }, []);

  // First visit with no agent: offer setup once. Fresh cloud agent: ask for Claude.
  useEffect(() => {
    if (status === "unpaired" && loaded) {
      try {
        if (!localStorage.getItem("woodpecker-notebook-onboarded")) {
          localStorage.setItem("woodpecker-notebook-onboarded", "1");
          setSheet("agent");
        }
      } catch {
        // storage blocked — skip the nudge
      }
    }
  }, [status, loaded]);
  useEffect(() => {
    if (info?.auth === "missing") setSheet((s) => (s === null || s === "agent" ? "credential" : s));
  }, [info?.auth]);

  // ---- page state + persistence --------------------------------------------
  const setPage = useCallback((fn: (p: Page) => Page) => {
    setPageState((prev) => {
      const next = fn(prev);
      pageRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => {
    const p = loadPage(date);
    pageRef.current = p;
    setPageState(p);
    undoStack.current = [];
    setOpenDot(null);
    setLoaded(true);
  }, [date]);

  // Save locally on every change; mirror to the agent so the iPad and the
  // laptop see the same page.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!loaded) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_PREFIX + page.date, JSON.stringify(page));
      } catch {
        // quota — the agent copy still has it
      }
      client?.saveCanvas(`notebook-${page.date}`, page.rev, page);
    }, 500);
  }, [page, loaded, client]);

  // On connect, pull the agent's copy if it is newer (written on another device).
  useEffect(() => {
    if (!connected || !client) return;
    let cancelled = false;
    const revAtRequest = pageRef.current.rev;
    void client.loadCanvas(`notebook-${date}`).then(({ rev, snapshot }) => {
      if (cancelled || !snapshot) return;
      if (rev <= pageRef.current.rev) return;
      if (pageRef.current.rev !== revAtRequest) {
        // You wrote something while the agent's copy was in flight — your
        // ink wins; bump past the remote rev so the next save replaces it.
        setPage((p) => ({ ...p, rev: rev + 1 }));
        return;
      }
      const remote = snapshot as Page;
      pageRef.current = remote;
      setPageState(remote);
    });
    return () => {
      cancelled = true;
    };
  }, [connected, client, date, setPage]);

  const commit = useCallback(
    (fn: (p: Page) => Page) => {
      undoStack.current.push({ strokes: pageRef.current.strokes, texts: pageRef.current.texts });
      if (undoStack.current.length > 80) undoStack.current.shift();
      setPage((p) => ({ ...fn(p), rev: p.rev + 1 }));
    },
    [setPage]
  );

  const setRow = useCallback(
    (row: number, sig: string | null, patch: Partial<RowState> | null) => {
      setPage((p) => {
        const existing = p.rows[row];
        if (patch === null) {
          if (!existing || sig === null || existing.sig === sig) {
            const rows = { ...p.rows };
            delete rows[row];
            return { ...p, rows };
          }
          return p;
        }
        // A full state (has its own sig) replaces; a partial only applies to
        // the content it was computed for — stale results are dropped.
        if (patch.sig !== undefined) {
          return { ...p, rows: { ...p.rows, [row]: { ...(patch as RowState) } } };
        }
        if (!existing) {
          if (sig === null) return p;
          return { ...p, rows: { ...p.rows, [row]: { sig, status: "reading", ...patch } } };
        }
        if (sig !== null && existing.sig !== sig) return p;
        return { ...p, rows: { ...p.rows, [row]: { ...existing, ...patch } } };
      });
    },
    [setPage]
  );

  // ---- ambient --------------------------------------------------------------
  const inkingRef = useRef(false);
  const ambient = useAmbient({
    page,
    setRow,
    client,
    connected: connected && info?.auth !== "missing",
    inking: () => inkingRef.current,
    onFeedback: (row) => setSheet({ why: row }),
  });

  // ---- layout ----------------------------------------------------------------
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const lastRow = useMemo(() => {
    let max = 0;
    for (const s of page.strokes) max = Math.max(max, s.row);
    for (const t of page.texts) max = Math.max(max, t.row);
    return max;
  }, [page.strokes, page.texts]);
  const pageHeight = Math.max(
    typeof window !== "undefined" ? window.innerHeight + 200 : 1200,
    rowTop(lastRow + 14)
  );

  const applyScroll = useCallback(
    (y: number) => {
      const maxY = Math.max(0, pageHeight - (viewport.current?.clientHeight ?? 0));
      scrollY.current = Math.max(0, Math.min(maxY, y));
      if (pageEl.current) pageEl.current.style.transform = `translate3d(0, ${-scrollY.current}px, 0)`;
    },
    [pageHeight]
  );

  // ---- pointer input -------------------------------------------------------
  const penSeen = useRef(false);
  const pointers = useRef(new Map<number, { x: number; y: number; type: string }>());
  const gesture = useRef<
    | null
    | { kind: "draw"; id: number; points: Point[]; startedAt: number }
    | { kind: "erase"; id: number; hit: Set<string> }
    | { kind: "scroll"; lastY: number }
    | { kind: "voice"; id: number; blockId: string; dict: Dictation | null }
  >(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdOrigin = useRef<{ x: number; y: number; id: number } | null>(null);

  const toPage = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = viewport.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top + scrollY.current];
  };

  const clearHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
    holdOrigin.current = null;
  };

  const endLive = () => {
    livePath.current?.setAttribute("d", "");
  };

  const startVoice = useCallback(
    (pointerId: number, x: number, y: number) => {
      endLive();
      const row = rowAt(y);
      const blockId = newId();
      const block: TextBlock = { id: blockId, row, x: Math.max(MARGIN_X + 8, x), text: "" };
      if (!speechSupported()) {
        setVoice({ x, y, level: "unsupported" });
        gesture.current = { kind: "voice", id: pointerId, blockId, dict: null };
        return;
      }
      commit((p) => ({ ...p, texts: [...p.texts, block] }));
      const dict = startDictation({
        onText: (text) =>
          setPage((p) => ({
            ...p,
            texts: p.texts.map((t) => (t.id === blockId ? { ...t, text } : t)),
          })),
        onError: (m) => setToast(m),
      });
      setVoice({ x, y, level: "listening" });
      gesture.current = { kind: "voice", id: pointerId, blockId, dict };
      navigator.vibrate?.(12);
    },
    [commit, setPage]
  );

  const finishVoice = useCallback(
    async (g: { blockId: string; dict: Dictation | null }) => {
      setVoice(null);
      if (!g.dict) return;
      const text = (await g.dict.stop()).trim();
      setPage((p) => ({
        ...p,
        rev: p.rev + 1,
        texts: text
          ? p.texts.map((t) => (t.id === g.blockId ? { ...t, text } : t))
          : p.texts.filter((t) => t.id !== g.blockId),
      }));
      const block = pageRef.current.texts.find((t) => t.id === g.blockId);
      if (text && block) ambient.touch([block.row]);
    },
    [ambient, setPage]
  );

  const eraseAt = (x: number, y: number, hit: Set<string>) => {
    const radius = 14;
    for (const s of pageRef.current.strokes) {
      if (!hit.has(s.id) && strokeHit(s, x, y, radius)) hit.add(s.id);
    }
    for (const t of pageRef.current.texts) {
      const top = rowTop(t.row);
      if (y > top && y < top + ROW_H && x > t.x - 6 && x < t.x + t.text.length * 13 + 6) hit.add(t.id);
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (sheet) return;
    setOpenDot(null);
    try {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    } catch {
      // Synthetic or already-released pointer — capture is a nicety.
    }
    const [x, y] = toPage(e);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });

    if (e.pointerType === "pen") penSeen.current = true;
    const touches = [...pointers.current.values()].filter((p) => p.type === "touch").length;

    // Second finger: whatever the first one started becomes a scroll.
    if (e.pointerType === "touch" && touches >= 2) {
      clearHold();
      endLive();
      inkingRef.current = false;
      gesture.current = { kind: "scroll", lastY: e.clientY };
      return;
    }

    const fingerScrolls = e.pointerType === "touch" && penSeen.current;
    const erasing = tool === "eraser" || (e.pointerType === "pen" && (e.buttons & 32) !== 0);

    if (fingerScrolls) {
      gesture.current = { kind: "scroll", lastY: e.clientY };
    } else if (erasing) {
      const hit = new Set<string>();
      eraseAt(x, y, hit);
      gesture.current = { kind: "erase", id: e.pointerId, hit };
    } else {
      inkingRef.current = true;
      gesture.current = {
        kind: "draw",
        id: e.pointerId,
        points: [[x, y, normalisePressure(e.pointerType, e.pressure)]],
        startedAt: performance.now(),
      };
    }

    // Press-and-hold to talk works from any tool.
    holdOrigin.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    holdTimer.current = setTimeout(() => {
      const g = gesture.current;
      if (!holdOrigin.current) return;
      if (g && g.kind === "draw" && g.points.length > 6) return;
      inkingRef.current = false;
      startVoice(e.pointerId, x, y);
      holdTimer.current = null;
    }, HOLD_MS);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (prev) pointers.current.set(e.pointerId, { ...prev, x: e.clientX, y: e.clientY });
    if (holdOrigin.current?.id === e.pointerId) {
      if (Math.hypot(e.clientX - holdOrigin.current.x, e.clientY - holdOrigin.current.y) > HOLD_SLOP) {
        clearHold();
      }
    }
    const g = gesture.current;
    if (!g) return;

    if (g.kind === "scroll") {
      applyScroll(scrollY.current - (e.clientY - g.lastY));
      g.lastY = e.clientY;
      return;
    }
    if (g.kind === "voice") return;
    if ("id" in g && g.id !== e.pointerId) return;

    // Coalesced events give Pencil its full 240Hz detail; the list can be
    // empty (untrusted events, some browsers), so fall back to the event.
    const coalesced =
      typeof (e.nativeEvent as PointerEvent).getCoalescedEvents === "function"
        ? (e.nativeEvent as PointerEvent).getCoalescedEvents()
        : [];
    const events = coalesced.length ? coalesced : [e.nativeEvent];

    if (g.kind === "erase") {
      for (const ev of events) {
        const [x, y] = toPage(ev);
        eraseAt(x, y, g.hit);
      }
      return;
    }

    for (const ev of events) {
      const [x, y] = toPage(ev);
      g.points.push([x, y, normalisePressure(ev.pointerType, ev.pressure)]);
    }
    livePath.current?.setAttribute("d", strokePath({ points: g.points, size: 1 }, true));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    clearHold();
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "scroll") {
      if (pointers.current.size === 0) gesture.current = null;
      return;
    }
    if ("id" in g && g.id !== e.pointerId) return;
    gesture.current = null;
    inkingRef.current = false;

    if (g.kind === "voice") {
      void finishVoice(g);
      return;
    }

    if (g.kind === "erase") {
      if (g.hit.size === 0) return;
      const rows = new Set<number>();
      for (const s of pageRef.current.strokes) if (g.hit.has(s.id)) rows.add(s.row);
      for (const t of pageRef.current.texts) if (g.hit.has(t.id)) rows.add(t.row);
      commit((p) => ({
        ...p,
        strokes: p.strokes.filter((s) => !g.hit.has(s.id)),
        texts: p.texts.filter((t) => !g.hit.has(t.id)),
      }));
      ambient.touch([...rows]);
      return;
    }

    // draw
    endLive();
    const points = g.points;
    if (points.length === 0) return;

    if (isScratchOut(points)) {
      const hit = new Set<string>();
      for (const p of points) eraseAt(p[0], p[1], hit);
      if (hit.size > 0) {
        const rows = new Set<number>();
        for (const s of pageRef.current.strokes) if (hit.has(s.id)) rows.add(s.row);
        for (const t of pageRef.current.texts) if (hit.has(t.id)) rows.add(t.row);
        commit((p) => ({
          ...p,
          strokes: p.strokes.filter((s) => !hit.has(s.id)),
          texts: p.texts.filter((t) => !hit.has(t.id)),
        }));
        ambient.touch([...rows]);
        return;
      }
    }

    const stroke: Stroke = { id: newId(), points, row: strokeRow(points, rowAt), size: 1 };
    commit((p) => ({ ...p, strokes: [...p.strokes, stroke] }));
    ambient.touch([stroke.row]);
  };

  const onWheel = (e: React.WheelEvent) => applyScroll(scrollY.current + e.deltaY);

  const undo = () => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    const rows = new Set<number>();
    for (const s of [...prev.strokes, ...pageRef.current.strokes]) rows.add(s.row);
    for (const t of [...prev.texts, ...pageRef.current.texts]) rows.add(t.row);
    setPage((p) => ({ ...p, strokes: prev.strokes, texts: prev.texts, rev: p.rev + 1 }));
    ambient.touch([...rows]);
  };

  // Toolbar mic: hold to dictate onto the next free line.
  const micDict = useRef<{ blockId: string; dict: Dictation | null } | null>(null);
  const micDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const row = nextFreeRow(pageRef.current);
    const y = rowTop(row) + ROW_H / 2;
    if (y - scrollY.current > (viewport.current?.clientHeight ?? 800) - 160) {
      applyScroll(y - (viewport.current?.clientHeight ?? 800) / 2);
    }
    if (!speechSupported()) {
      setToast("Voice isn't supported in this browser — try Safari or Chrome.");
      return;
    }
    const blockId = newId();
    commit((p) => ({ ...p, texts: [...p.texts, { id: blockId, row, x: MARGIN_X + 12, text: "" }] }));
    const dict = startDictation({
      onText: (text) =>
        setPage((p) => ({ ...p, texts: p.texts.map((t) => (t.id === blockId ? { ...t, text } : t)) })),
      onError: (m) => setToast(m),
    });
    micDict.current = { blockId, dict };
    setVoice({ x: MARGIN_X + 12, y, level: "listening" });
  };
  const micUp = () => {
    const m = micDict.current;
    micDict.current = null;
    if (m) void finishVoice(m);
    else setVoice(null);
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  // Cmd/Ctrl+Z
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !(e.target instanceof HTMLTextAreaElement) && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- render ------------------------------------------------------------------
  const readingRows = useMemo(
    () => new Set(Object.entries(page.rows).filter(([, s]) => s.status === "reading").map(([r]) => Number(r))),
    [page.rows]
  );
  const paths = useMemo(() => {
    const cache = new Map<string, string>();
    for (const s of page.strokes) cache.set(s.id, strokePath(s));
    return cache;
  }, [page.strokes]);

  const { day, rest } = prettyDate(date);
  const isToday = date === todayKey();
  const whyRow = sheet && typeof sheet === "object" ? sheet.why : null;

  const statusLabel =
    status === "unpaired"
      ? "Add an agent"
      : status !== "connected"
        ? "Agent waking…"
        : info?.auth === "missing"
          ? "Connect Claude"
          : info?.mode === "cloud"
            ? "Agent · cloud"
            : `Agent · ${info?.hostname ?? "local"}`;
  const statusTone =
    status === "connected" && info?.auth !== "missing" ? "ok" : status === "unpaired" ? "off" : "wait";

  return (
    <div className="nb" data-tool={tool}>
      <header className="nb-top">
        <div className="nb-date">
          <button className="nb-icon-btn" onClick={() => setDate((d) => shiftDate(d, -1))} aria-label="Previous day">
            <ChevronLeft size={18} />
          </button>
          <div>
            <div className="nb-day">{day}</div>
            <div className="nb-rest">
              {rest}
              {!isToday && (
                <button className="nb-today" onClick={() => setDate(todayKey())}>
                  today
                </button>
              )}
            </div>
          </div>
          <button className="nb-icon-btn" onClick={() => setDate((d) => shiftDate(d, 1))} aria-label="Next day">
            <ChevronRight size={18} />
          </button>
        </div>
        <button
          className={`nb-status nb-status--${statusTone}`}
          onClick={() => setSheet(info?.auth === "missing" ? "credential" : "agent")}
        >
          <span className="nb-live-dot" />
          {statusLabel}
        </button>
      </header>

      <div
        ref={viewport}
        className="nb-viewport"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div ref={pageEl} className="nb-page" style={{ height: pageHeight }}>
          <div
            className="nb-rules"
            style={{
              top: PAGE_TOP,
              backgroundSize: `100% ${ROW_H}px`,
            }}
          />
          <div className="nb-margin" style={{ left: MARGIN_X }} />

          {page.strokes.length === 0 && page.texts.length === 0 && (
            <div className="nb-hint" style={{ top: rowTop(0) + 12, left: MARGIN_X + 16 }}>
              Write anything. Try: <em>email Sam about Friday</em> · or hold your finger down and talk.
            </div>
          )}

          <svg className="nb-ink" width={width} height={pageHeight}>
            <defs>
              <linearGradient id="nb-shimmer" x1="0" x2="1" y1="0" y2="0" gradientUnits="objectBoundingBox">
                <stop offset="0" stopColor="var(--ink)" />
                <stop offset="0.42" stopColor="var(--ink)" />
                <stop offset="0.5" stopColor="var(--magic)" />
                <stop offset="0.58" stopColor="var(--ink)" />
                <stop offset="1" stopColor="var(--ink)" />
                <animateTransform
                  attributeName="gradientTransform"
                  type="translate"
                  from="-1 0"
                  to="1 0"
                  dur="1.3s"
                  repeatCount="indefinite"
                />
              </linearGradient>
            </defs>
            {page.strokes.map((s) => (
              <path
                key={s.id}
                d={paths.get(s.id)}
                className={readingRows.has(s.row) ? "nb-ink-path nb-ink-path--reading" : "nb-ink-path"}
              />
            ))}
            <path ref={livePath} className="nb-ink-path" />
          </svg>

          {page.texts.map((t) => (
            <div
              key={t.id}
              className={`nb-spoken${readingRows.has(t.row) ? " nb-spoken--reading" : ""}`}
              style={{ left: t.x, top: rowTop(t.row) + ROW_H - 46 }}
            >
              {t.text || "…"}
            </div>
          ))}

          {Object.entries(page.rows).map(([rowKey, st]) => {
            const row = Number(rowKey);
            return (
              <RowDot
                key={rowKey}
                state={st}
                x={Math.min(rowEndX(page, row) + 22, width - 28)}
                y={rowTop(row) + ROW_H / 2 + 4}
                pageWidth={width}
                open={openDot === row}
                onOpen={(o) => setOpenDot(o ? row : null)}
                onApprove={(d?: Draft) => {
                  setOpenDot(null);
                  void ambient.approve(row, d);
                }}
                onCancel={() => {
                  setOpenDot(null);
                  ambient.cancel(row);
                }}
                onRetry={() => {
                  setOpenDot(null);
                  ambient.retry(row);
                }}
              />
            );
          })}

          {voice && (
            <div className={`nb-orb nb-orb--${voice.level}`} style={{ left: voice.x, top: voice.y }}>
              <span />
              {voice.level === "unsupported" && <em>Voice needs Safari or Chrome</em>}
            </div>
          )}
        </div>
      </div>

      <nav className="nb-tools" onPointerDown={(e) => e.stopPropagation()}>
        <button className={tool === "pen" ? "is-on" : ""} onClick={() => setTool("pen")} aria-label="Pen">
          <PenLine size={20} />
        </button>
        <button className={tool === "eraser" ? "is-on" : ""} onClick={() => setTool("eraser")} aria-label="Eraser">
          <Eraser size={20} />
        </button>
        <button onClick={undo} aria-label="Undo">
          <Undo2 size={20} />
        </button>
        <span className="nb-tools-sep" />
        <button
          className="nb-mic"
          aria-label="Hold to talk"
          onPointerDown={micDown}
          onPointerUp={micUp}
          onPointerCancel={micUp}
          onContextMenu={(e) => e.preventDefault()}
        >
          <Mic size={20} />
        </button>
        <span className="nb-tools-sep" />
        <button onClick={() => setSheet("learned")} aria-label="What it has learned">
          <Sparkles size={19} />
        </button>
      </nav>

      {toast && <div className="nb-toast">{toast}</div>}

      {sheet === "agent" && <AgentSheet client={client} status={status} info={info} onClose={() => setSheet(null)} />}
      {sheet === "credential" && <CredentialSheet client={client} onClose={() => setSheet(null)} />}
      {sheet === "learned" && <LearnedSheet client={client} onClose={() => setSheet(null)} />}
      {whyRow !== null && (
        <WhySheet
          lineText={page.rows[whyRow]?.text ?? ""}
          onClose={() => setSheet(null)}
          onSubmit={(reason, reasonImage) => {
            const st = pageRef.current.rows[whyRow];
            if (st) {
              client?.feedback(
                {
                  text: st.text ?? "",
                  intent: st.intent ?? "none",
                  kind: st.kind,
                  verdict: "cancelled",
                  reason,
                },
                reasonImage
              );
            }
            setSheet(null);
          }}
        />
      )}
    </div>
  );
}
