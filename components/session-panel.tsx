"use client";

import { useEffect, useState, useCallback } from "react";
import { Clock, GitBranch, X, History, ChevronRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { getConnectorClient } from "@/lib/connector-client";

interface SessionInfo {
  session_id: string;
  summary: string;
  first_prompt: string;
  last_modified: number;
  tag: string | null;
}

interface SessionPanelProps {
  editorRef: React.MutableRefObject<any>;
  open: boolean;
  onClose: () => void;
  darkMode?: boolean;
}

function panelColors(dark: boolean) {
  return dark
    ? {
        bg: "#1a1a1a",
        border: "#333",
        text: "#e0e0e0",
        textMuted: "#999",
        textDim: "#777",
        textFaint: "#666",
        shadow: "-4px 0 20px rgba(0,0,0,0.3)",
        badgeBg: "#333",
        rowActiveBg: "#2a2a2a",
        rowActiveBorder: "#444",
        rowHoverBg: "#222",
        rowActiveText: "#fff",
        rowText: "#ccc",
        idColor: "#555",
      }
    : {
        bg: "#ffffff",
        border: "#e0e0e0",
        text: "#1a1a1a",
        textMuted: "#666",
        textDim: "#888",
        textFaint: "#aaa",
        shadow: "-4px 0 20px rgba(0,0,0,0.08)",
        badgeBg: "#eee",
        rowActiveBg: "#f0f0f0",
        rowActiveBorder: "#ccc",
        rowHoverBg: "#f5f5f5",
        rowActiveText: "#000",
        rowText: "#333",
        idColor: "#aaa",
      };
}

export function SessionPanel({ editorRef, open, onClose, darkMode }: SessionPanelProps) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const c = panelColors(darkMode ?? true);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getConnectorClient()
      .listSessions()
      .then((sessions) => {
        setSessions(sessions as SessionInfo[]);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [open]);

  const focusSession = useCallback(
    (sessionId: string) => {
      const editor = editorRef.current;
      if (!editor) return;

      const shapes = editor.getCurrentPageShapes();
      const matching = shapes.filter(
        (s: any) =>
          s.type === "handwritten-text" &&
          (s.props?.claudeSessionId === sessionId ||
            s.props?.forkSessionId === sessionId)
      );

      if (matching.length === 0) {
        setActiveSessionId(null);
        return;
      }

      setActiveSessionId(sessionId);

      // Calculate bounding box of all matching shapes
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;

      for (const shape of matching) {
        const bounds = editor.getShapeGeometry(shape).bounds;
        minX = Math.min(minX, shape.x + bounds.minX);
        minY = Math.min(minY, shape.y + bounds.minY);
        maxX = Math.max(maxX, shape.x + bounds.maxX);
        maxY = Math.max(maxY, shape.y + bounds.maxY);
      }

      const padding = 80;
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const bw = maxX - minX + padding * 2;
      const bh = maxY - minY + padding * 2;

      // Zoom to fit the shapes in the viewport
      const vw = editor.getViewportScreenBounds().width;
      const vh = editor.getViewportScreenBounds().height;
      const zoom = Math.min(1, Math.min(vw / bw, vh / bh));

      editor.setCamera({
        x: -(cx - vw / zoom / 2),
        y: -(cy - vh / zoom / 2),
        z: zoom,
      });

      // Briefly select the shapes to highlight them
      editor.select(...matching.map((s: any) => s.id));
      setTimeout(() => {
        try {
          editor.selectNone();
        } catch {}
      }, 1500);
    },
    [editorRef]
  );

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: 360,
        background: c.bg,
        borderLeft: `1px solid ${c.border}`,
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        fontFamily: "system-ui, -apple-system, sans-serif",
        color: c.text,
        boxShadow: c.shadow,
        transition: "background 0.2s, color 0.2s, border-color 0.2s",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "16px 20px",
          borderBottom: `1px solid ${c.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <History size={16} style={{ opacity: 0.6 }} />
          <span style={{ fontSize: 14, fontWeight: 600 }}>Sessions</span>
          <span
            style={{
              fontSize: 11,
              background: c.badgeBg,
              borderRadius: 10,
              padding: "2px 8px",
              color: c.textMuted,
            }}
          >
            {sessions.length}
          </span>
        </div>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            color: c.textMuted,
            cursor: "pointer",
            padding: 4,
            display: "flex",
          }}
        >
          <X size={18} />
        </button>
      </div>

      {/* Session list */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "8px 12px",
        }}
      >
        {loading ? (
          <div style={{ padding: 20, textAlign: "center", color: c.textFaint }}>
            Loading...
          </div>
        ) : sessions.length === 0 ? (
          <div style={{ padding: 20, textAlign: "center", color: c.textFaint }}>
            No sessions yet.
          </div>
        ) : (
          sessions.map((s) => (
            <SessionRow
              key={s.session_id}
              session={s}
              active={activeSessionId === s.session_id}
              onFocus={() => focusSession(s.session_id)}
              colors={c}
            />
          ))
        )}
      </div>
    </div>
  );
}

function SessionRow({
  session,
  active,
  onFocus,
  colors: c,
}: {
  session: SessionInfo;
  active: boolean;
  onFocus: () => void;
  colors: ReturnType<typeof panelColors>;
}) {
  const summary = session.summary || "(no prompt)";
  const truncated =
    summary.length > 80 ? summary.slice(0, 80) + "\u2026" : summary;
  const isFork = summary.includes("(fork)");

  let timeAgo: string;
  try {
    timeAgo = formatDistanceToNow(new Date(session.last_modified), {
      addSuffix: true,
    });
  } catch {
    timeAgo = "unknown";
  }

  return (
    <button
      onClick={onFocus}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        background: active ? c.rowActiveBg : "transparent",
        border: active ? `1px solid ${c.rowActiveBorder}` : "1px solid transparent",
        borderRadius: 8,
        padding: "12px 14px",
        marginBottom: 4,
        cursor: "pointer",
        transition: "background 0.15s",
        color: c.text,
      }}
      onMouseEnter={(e) => {
        if (!active)
          (e.currentTarget as HTMLElement).style.background = c.rowHoverBg;
      }}
      onMouseLeave={(e) => {
        if (!active)
          (e.currentTarget as HTMLElement).style.background = "transparent";
      }}
    >
      <div
        style={{
          fontSize: 13,
          lineHeight: 1.4,
          marginBottom: 6,
          color: active ? c.rowActiveText : c.rowText,
        }}
      >
        {truncated}
      </div>
      <div
        style={{
          display: "flex",
          gap: 10,
          fontSize: 11,
          color: c.textDim,
          alignItems: "center",
        }}
      >
        {isFork && (
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 3 }}
          >
            <GitBranch size={10} />
            fork
          </span>
        )}
        <span
          style={{ display: "inline-flex", alignItems: "center", gap: 3 }}
        >
          <Clock size={10} />
          {timeAgo}
        </span>
        <span style={{ fontFamily: "monospace", fontSize: 10, color: c.idColor }}>
          {session.session_id.slice(0, 8)}
        </span>
        <ChevronRight
          size={12}
          style={{ marginLeft: "auto", opacity: 0.4 }}
        />
      </div>
    </button>
  );
}

export function SessionPanelToggle({ onClick, darkMode }: { onClick: () => void; darkMode?: boolean }) {
  const dark = darkMode ?? true;
  return (
    <button
      onClick={onClick}
      title="Session history"
      style={{
        position: "fixed",
        top: 12,
        right: 12,
        zIndex: 999,
        width: 36,
        height: 36,
        borderRadius: 8,
        background: dark ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.8)",
        border: dark ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(0,0,0,0.1)",
        color: dark ? "#ccc" : "#555",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backdropFilter: "blur(8px)",
        transition: "background 0.2s, color 0.2s, border-color 0.2s",
      }}
    >
      <History size={16} />
    </button>
  );
}
