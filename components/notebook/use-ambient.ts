"use client";

/**
 * The ambient loop. You write; when you pause, every row you touched is
 * handed to the agent to read. Rows that are just writing stay quiet. Rows
 * that ask for something grow a dot that starts working on its own — but
 * only ever in draft: answers come back, actions wait for your tick.
 */

import { useCallback, useEffect, useRef } from "react";
import type { Draft } from "@woodpeckeros/protocol";
import type { ConnectorClient } from "@/lib/connector-client";
import { rasterizeRow } from "@/lib/notebook/ink";
import { rowSig, type Page, type RowState } from "@/lib/notebook/model";

/** How sure the classifier must be before a dot appears. */
const DOT_THRESHOLD = 0.55;
/** Pause after the last stroke before the agent reads. */
const IDLE_MS = 1400;
const MAX_ROWS_PER_READ = 8;

export type AmbientApi = {
  /** Mark rows as changed; they'll be read after the next pause. */
  touch: (rows: number[]) => void;
  approve: (row: number, draftOverride?: Draft) => void;
  cancel: (row: number) => void;
  /** Re-run the dot for a row (after a cancel or an error). */
  retry: (row: number) => void;
};

export function useAmbient(opts: {
  page: Page;
  setRow: (row: number, sig: string | null, patch: Partial<RowState> | null) => void;
  client: ConnectorClient | null;
  connected: boolean;
  /** True while a pen/finger is on the page — never read mid-word. */
  inking: () => boolean;
  onFeedback?: (row: number) => void;
}): AmbientApi {
  const pageRef = useRef(opts.page);
  pageRef.current = opts.page;
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const dirty = useRef(new Set<number>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reading = useRef(false);

  const contextFor = useCallback((page: Page, exclude: number[]) => {
    const skip = new Set(exclude);
    return Object.entries(page.rows)
      .filter(([row, st]) => !skip.has(Number(row)) && st.text)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([, st]) => st.text as string);
  }, []);

  const startDraft = useCallback(
    async (row: number, sig: string, state: RowState) => {
      const { client, setRow } = optsRef.current;
      if (!client || !state.text || !state.intent || state.intent === "none") return;
      setRow(row, sig, { status: "drafting", progress: undefined, error: undefined });
      try {
        const draft = await client.draft(
          {
            lineId: String(row),
            text: state.text,
            intent: state.intent,
            kindHint: state.kind,
            context: contextFor(pageRef.current, [row]),
          },
          (label) => setRow(row, sig, { progress: label })
        );
        setRow(row, sig, {
          status: draft.needsApproval ? "ready" : "answered",
          draft,
          progress: undefined,
        });
      } catch (error) {
        setRow(row, sig, {
          status: "error",
          error: error instanceof Error ? error.message : "Something went wrong",
          progress: undefined,
        });
      }
    },
    [contextFor]
  );

  const read = useCallback(async () => {
    const { client, connected, setRow, inking } = optsRef.current;
    if (reading.current || !client || !connected) return;
    if (inking()) {
      schedule();
      return;
    }
    const page = pageRef.current;
    const batch: { row: number; sig: string; image?: string; text?: string }[] = [];

    for (const row of [...dirty.current].sort((a, b) => a - b)) {
      dirty.current.delete(row);
      const sig = rowSig(page, row);
      const existing = page.rows[row];
      if (!sig) {
        if (existing) setRow(row, null, null);
        continue;
      }
      if (existing?.sig === sig) continue;
      // Something the user already ticked stays settled — new ink on that
      // line (a tick mark, a strike-through) is theirs, not a new request.
      if (existing && (existing.status === "running" || existing.status === "done")) continue;

      const hasInk = page.strokes.some((s) => s.row === row);
      const spoken = page.texts
        .filter((t) => t.row === row)
        .map((t) => t.text.trim())
        .filter(Boolean)
        .join(" ");
      batch.push({
        row,
        sig,
        image: hasInk ? rasterizeRow(page, row) ?? undefined : undefined,
        text: hasInk ? undefined : spoken,
      });
      if (batch.length >= MAX_ROWS_PER_READ) break;
    }
    if (batch.length === 0) return;

    reading.current = true;
    for (const b of batch) setRow(b.row, b.sig, { status: "reading" });
    try {
      const observed = await client.observe(
        batch.map((b) => ({ id: String(b.row), image: b.image, text: b.text })),
        contextFor(page, batch.map((b) => b.row))
      );
      for (const b of batch) {
        const o = observed.find((x) => x.id === String(b.row));
        if (!o) {
          setRow(b.row, b.sig, { status: "quiet" });
          continue;
        }
        const wantsHelp = o.intent !== "none" && o.confidence >= DOT_THRESHOLD;
        const state: RowState = {
          sig: b.sig,
          status: wantsHelp ? "drafting" : "quiet",
          text: o.text,
          intent: o.intent,
          confidence: o.confidence,
          title: o.title,
          kind: o.kind,
        };
        setRow(b.row, b.sig, state);
        if (wantsHelp) void startDraft(b.row, b.sig, state);
      }
    } catch (error) {
      // Couldn't read — put the rows back so the next pause retries them.
      for (const b of batch) {
        setRow(b.row, b.sig, null);
        dirty.current.add(b.row);
      }
      console.warn("[ambient] read failed:", error);
    } finally {
      reading.current = false;
      if (dirty.current.size > 0) schedule();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextFor, startDraft]);

  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void read(), IDLE_MS);
  }, [read]);

  const touch = useCallback(
    (rows: number[]) => {
      for (const r of rows) dirty.current.add(r);
      schedule();
    },
    [schedule]
  );

  // When the agent (re)connects, read whatever was written while it was away
  // and resume dots that were mid-flight when the page was closed.
  useEffect(() => {
    if (!opts.connected) return;
    const page = pageRef.current;
    for (const [rowKey, st] of Object.entries(page.rows)) {
      const row = Number(rowKey);
      if (st.status === "reading") dirty.current.add(row);
      if (st.status === "drafting") void startDraft(row, st.sig, st);
    }
    const knownSigs = new Set(Object.values(page.rows).map((s) => s.sig));
    const rows = new Set([...page.strokes.map((s) => s.row), ...page.texts.map((t) => t.row)]);
    for (const row of rows) {
      const sig = rowSig(page, row);
      if (!knownSigs.has(sig)) dirty.current.add(row);
    }
    if (dirty.current.size) schedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.connected]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const approve = useCallback(async (row: number, draftOverride?: Draft) => {
    const { client, setRow } = optsRef.current;
    const st = pageRef.current.rows[row];
    const draft = draftOverride ?? st?.draft;
    if (!client || !st || !draft) return;
    const sig = st.sig;
    setRow(row, sig, { status: "running", draft, progress: undefined });
    client.feedback({
      text: st.text ?? "",
      intent: st.intent ?? "action",
      kind: st.kind,
      verdict: "approved",
    });
    let last = "";
    try {
      for await (const event of client.approve(String(row), st.text ?? "", draft)) {
        if (event.type === "tool_use" && event.toolName) {
          setRow(row, sig, { progress: event.toolName.replace(/^mcp__[^_]+__/, "").replace(/_/g, " ") });
        } else if (event.type === "text_delta" && event.content) {
          last += event.content;
        } else if (event.type === "done") {
          const result =
            (event.content || last)
              .replace(/[`*_#>]/g, "")
              .trim()
              .split("\n")
              .filter(Boolean)
              .pop() ?? "Done";
          setRow(row, sig, { status: "done", result, progress: undefined });
          return;
        } else if (event.type === "error") {
          setRow(row, sig, { status: "error", error: event.content ?? "Failed", progress: undefined });
          return;
        }
      }
    } catch (error) {
      setRow(row, sig, {
        status: "error",
        error: error instanceof Error ? error.message : "Failed",
        progress: undefined,
      });
    }
  }, []);

  const cancel = useCallback((row: number) => {
    const { setRow, onFeedback } = optsRef.current;
    const st = pageRef.current.rows[row];
    if (!st) return;
    setRow(row, st.sig, { status: "cancelled", progress: undefined });
    onFeedback?.(row);
  }, []);

  const retry = useCallback(
    (row: number) => {
      const st = pageRef.current.rows[row];
      if (!st) return;
      if (st.text && st.intent && st.intent !== "none") void startDraft(row, st.sig, st);
      else {
        optsRef.current.setRow(row, null, null);
        touch([row]);
      }
    },
    [startDraft, touch]
  );

  return { touch, approve, cancel, retry };
}
