import type { Metadata } from "next";
import { HeroCta } from "@/components/hero-cta";

export const metadata: Metadata = {
  title: "Woodpecker OS — drive Claude Code with a pen",
  description:
    "Turn an iPad or e-ink display into a handwriting interface for the Claude Code on your machine. Write, circle, and your agent does the work — end-to-end encrypted, no cloud execution.",
};

const mono = "'Share Tech Mono', ui-monospace, monospace";

export default function Landing() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0a0a14",
        color: "#cfe8d8",
        fontFamily: "system-ui, -apple-system, sans-serif",
        lineHeight: 1.7,
      }}
    >
      <main style={{ maxWidth: 680, margin: "0 auto", padding: "72px 24px 96px" }}>
        {/* Hero */}
        <p style={{ fontFamily: mono, color: "#88ccaa", fontSize: 14, letterSpacing: 2, margin: 0 }}>
          WOODPECKER OS
        </p>
        <h1 style={{ fontSize: 42, lineHeight: 1.15, margin: "16px 0 20px", color: "#eafff2", fontWeight: 600 }}>
          Drive Claude Code with a pen.
        </h1>
        <p style={{ fontSize: 18, margin: "0 0 36px", opacity: 0.85 }}>
          Woodpecker turns an iPad or e-ink display into a handwriting interface
          for the Claude Code running on <em>your</em> machine. Write a thought,
          circle it with the magic pen — your agent reads it, does the work with
          your files and your tools, and writes back in ink.
        </p>
        <HeroCta />

        {/* What circling does */}
        <section style={{ marginBottom: 72 }}>
          <h2 style={{ fontSize: 22, color: "#eafff2", marginBottom: 18 }}>
            One gesture: circle it
          </h2>
          <div style={{ display: "grid", gap: 18 }}>
            {[
              {
                n: "01",
                title: "Circle a task — it gets done.",
                body: "Handwrite “scaffold the API for the invoices feature” and circle it. Claude Code runs on your machine: reads your repo, edits files, runs commands, and streams what it's doing back onto the canvas.",
              },
              {
                n: "02",
                title: "Circle a question — it gets answered.",
                body: "Sketch an idea, circle it, and get a researched reply written back in handwriting beside your notes. Everything Claude sees is exactly what's inside your circle.",
              },
              {
                n: "03",
                title: "Circle a reply — the thread continues.",
                body: "Every response is a fork point. Circle any reply to branch the session from that exact moment — explore three directions without them contaminating each other.",
              },
              {
                n: "04",
                title: "Your tools come with it.",
                body: "The agent inherits your Claude Code setup: your login, your working directory, your MCP servers. If your terminal Claude can do it, your pen can too.",
              },
            ].map((item) => (
              <div
                key={item.n}
                style={{
                  border: "1px solid #1c2a22",
                  borderRadius: 10,
                  padding: "18px 22px",
                  background: "#0e0e1a",
                }}
              >
                <div style={{ fontFamily: mono, color: "#88ccaa", fontSize: 12, marginBottom: 6 }}>{item.n}</div>
                <div style={{ color: "#eafff2", fontWeight: 600, marginBottom: 4 }}>{item.title}</div>
                <div style={{ fontSize: 15, opacity: 0.8 }}>{item.body}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Why a pen */}
        <section style={{ marginBottom: 72 }}>
          <h2 style={{ fontSize: 22, color: "#eafff2", marginBottom: 18 }}>Why a pen?</h2>
          <p style={{ fontSize: 16, opacity: 0.85, margin: "0 0 12px" }}>
            Because the best thinking happens away from a screen full of tabs and
            feeds — and the moment you reach for the phone to &ldquo;just check one
            thing,&rdquo; the morning is gone. Woodpecker gives you the leverage of
            your agent without opening the machine of distraction: paper-like
            calm on one side, full Claude Code on the other.
          </p>
          <p style={{ fontSize: 16, opacity: 0.85, margin: 0 }}>
            It&apos;s not a notepad app. It&apos;s a command line made of ink.
          </p>
        </section>

        {/* How it works / security */}
        <section style={{ marginBottom: 72 }}>
          <h2 style={{ fontSize: 22, color: "#eafff2", marginBottom: 18 }}>
            Your machine does the work
          </h2>
          <p style={{ fontSize: 16, opacity: 0.85, margin: "0 0 12px" }}>
            This site is just the canvas. The intelligence runs on{" "}
            <strong>your computer</strong> — your Claude login, your files, your
            tools. Canvas and computer are paired with end-to-end encryption;
            the relay between them only ever carries ciphertext. No accounts, no
            cloud execution, no keys ever leave your machine.
          </p>
          <p style={{ fontSize: 16, opacity: 0.85, margin: 0 }}>
            Guardrails are on by default: the agent works inside the folder you
            choose, and destructive commands are blocked before they run.
          </p>
        </section>

        {/* Quick start */}
        <section id="start" style={{ marginBottom: 72 }}>
          <h2 style={{ fontSize: 22, color: "#eafff2", marginBottom: 18 }}>Start in three steps</h2>
          <ol style={{ paddingLeft: 0, listStyle: "none", display: "grid", gap: 14, margin: 0 }}>
            <li style={{ display: "flex", gap: 16, alignItems: "baseline" }}>
              <span style={{ fontFamily: mono, color: "#88ccaa" }}>1</span>
              <span>
                On your computer:{" "}
                <code style={{ fontFamily: mono, background: "#131322", padding: "3px 10px", borderRadius: 6, color: "#88ccaa", fontSize: 15 }}>
                  npx woodpeckeros connect
                </code>
              </span>
            </li>
            <li style={{ display: "flex", gap: 16, alignItems: "baseline" }}>
              <span style={{ fontFamily: mono, color: "#88ccaa" }}>2</span>
              <span>Scan the QR code it prints from your iPad (or open the link in any browser).</span>
            </li>
            <li style={{ display: "flex", gap: 16, alignItems: "baseline" }}>
              <span style={{ fontFamily: mono, color: "#88ccaa" }}>3</span>
              <span>Write something, pick the magic pen, and circle it. That&apos;s the whole interface.</span>
            </li>
          </ol>
          <p style={{ marginTop: 20, fontSize: 14, opacity: 0.6 }}>
            Uses your existing Claude Code login (Claude Pro/Max or API key) — no API key pasted here, no account created.
          </p>
        </section>

        {/* Footer */}
        <footer style={{ borderTop: "1px solid #1c2a22", paddingTop: 28, fontSize: 14, opacity: 0.6 }}>
          <p style={{ margin: 0 }}>
            Five hundred years ago a notebook entry read: <em>&ldquo;describe the tongue of a
            woodpecker.&rdquo;</em> A mind with room to wonder — and the tools to chase it.
          </p>
        </footer>
      </main>
    </div>
  );
}
