"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Clock, Hash, GitBranch } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface SessionRow {
  session_id: string;
  summary: string;
  first_prompt: string;
  last_modified: number;
  tag: string | null;
}

interface SessionData {
  sessions: SessionRow[];
  stats: { total: number; today: number };
}

export default function SessionsPage() {
  const [data, setData] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/sessions")
      .then((res) => res.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  const active =
    data?.sessions.filter((s) => s.last_modified >= oneHourAgo) || [];
  const historical =
    data?.sessions.filter((s) => s.last_modified < oneHourAgo) || [];

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f5f5f0",
        fontFamily: "'Georgia', serif",
        color: "#333",
      }}
    >
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "48px 24px" }}>
        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            color: "#666",
            textDecoration: "none",
            fontSize: 14,
            marginBottom: 32,
          }}
        >
          <ArrowLeft size={16} />
          Back to canvas
        </Link>

        <h1
          style={{
            fontSize: 24,
            fontWeight: 400,
            marginBottom: 8,
            color: "#222",
          }}
        >
          Sessions
        </h1>
        <p style={{ color: "#888", fontSize: 14, marginBottom: 24 }}>
          Your Claude Code conversation history.
        </p>

        {loading ? (
          <p style={{ color: "#999" }}>Loading...</p>
        ) : !data || data.sessions.length === 0 ? (
          <div
            style={{
              border: "1px solid #ddd",
              borderRadius: 8,
              padding: "32px 24px",
              background: "#fff",
              textAlign: "center",
              color: "#999",
              fontSize: 14,
            }}
          >
            No sessions yet. Circle something on the canvas to start one.
          </div>
        ) : (
          <>
            {/* Stats bar */}
            <div
              style={{
                display: "flex",
                gap: 16,
                marginBottom: 32,
              }}
            >
              <StatBadge label="Total" value={data.stats.total} />
              <StatBadge label="Today" value={data.stats.today} />
            </div>

            {/* Active sessions */}
            {active.length > 0 && (
              <Section title="Active">
                {active.map((s) => (
                  <SessionCard key={s.session_id} session={s} />
                ))}
              </Section>
            )}

            {/* Historical sessions */}
            {historical.length > 0 && (
              <Section title="History">
                {historical.map((s) => (
                  <SessionCard key={s.session_id} session={s} />
                ))}
              </Section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function StatBadge({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        border: "1px solid #ddd",
        borderRadius: 8,
        padding: "12px 20px",
        background: "#fff",
        flex: 1,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 500, color: "#222" }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>{label}</div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 32 }}>
      <h2
        style={{
          fontSize: 13,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: 1,
          color: "#999",
          marginBottom: 12,
        }}
      >
        {title}
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {children}
      </div>
    </div>
  );
}

function SessionCard({ session }: { session: SessionRow }) {
  const summary = session.summary || "(no prompt)";
  const truncated =
    summary.length > 100 ? summary.slice(0, 100) + "\u2026" : summary;

  let timeAgo: string;
  try {
    timeAgo = formatDistanceToNow(new Date(session.last_modified), {
      addSuffix: true,
    });
  } catch {
    timeAgo = "unknown";
  }

  const isFork = summary.includes("(fork)");

  return (
    <div
      style={{
        border: "1px solid #ddd",
        borderRadius: 8,
        padding: "16px 20px",
        background: "#fff",
      }}
    >
      <div
        style={{
          fontSize: 15,
          color: "#333",
          marginBottom: 8,
          lineHeight: 1.4,
        }}
      >
        {truncated}
      </div>
      <div
        style={{
          display: "flex",
          gap: 16,
          fontSize: 12,
          color: "#999",
        }}
      >
        {isFork && (
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
          >
            <GitBranch size={12} />
            fork
          </span>
        )}
        {session.tag && (
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
          >
            <Hash size={12} />
            {session.tag}
          </span>
        )}
        <span
          style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
        >
          <Clock size={12} />
          {timeAgo}
        </span>
        <span
          style={{
            fontSize: 11,
            color: "#bbb",
            fontFamily: "monospace",
          }}
        >
          {session.session_id.slice(0, 8)}
        </span>
      </div>
    </div>
  );
}
