"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Mail, MessageSquare, CheckCircle, ArrowLeft } from "lucide-react";

export default function SettingsPage() {
  const [status, setStatus] = useState<{
    google: boolean;
    microsoft: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/status")
      .then((res) => res.json())
      .then((data) => {
        setStatus(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

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
          Connections
        </h1>
        <p style={{ color: "#888", fontSize: 14, marginBottom: 40 }}>
          Connect your accounts to check emails and messages from the canvas.
        </p>

        {loading ? (
          <p style={{ color: "#999" }}>Loading...</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <ConnectionCard
              icon={<Mail size={20} />}
              title="Gmail"
              description="Read and reply to emails"
              connected={status?.google || false}
              connectUrl="/api/auth/google"
            />
            <ConnectionCard
              icon={<MessageSquare size={20} />}
              title="Microsoft"
              description="Outlook email and Teams messages"
              connected={status?.microsoft || false}
              connectUrl="/api/auth/microsoft"
            />
          </div>
        )}
      </div>
    </div>
  );
}

function ConnectionCard({
  icon,
  title,
  description,
  connected,
  connectUrl,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  connected: boolean;
  connectUrl: string;
}) {
  return (
    <div
      style={{
        border: "1px solid #ddd",
        borderRadius: 8,
        padding: "20px 24px",
        background: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ color: "#666" }}>{icon}</div>
        <div>
          <div style={{ fontWeight: 500, fontSize: 16 }}>{title}</div>
          <div style={{ color: "#999", fontSize: 13 }}>{description}</div>
        </div>
      </div>

      {connected ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            color: "#666",
            fontSize: 14,
          }}
        >
          <CheckCircle size={16} />
          Connected
        </div>
      ) : (
        <a
          href={connectUrl}
          style={{
            padding: "8px 20px",
            border: "1px solid #ccc",
            borderRadius: 6,
            background: "#fafafa",
            color: "#333",
            textDecoration: "none",
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          Connect
        </a>
      )}
    </div>
  );
}
