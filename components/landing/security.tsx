import { CloudOff, KeyRound, Lock, Radio } from "lucide-react";

const cards = [
  {
    icon: Lock,
    label: "END-TO-END ENCRYPTED",
    body: "AES-256-GCM, encrypted in your browser, decrypted only on your computer. The relay forwards bytes it cannot read.",
  },
  {
    icon: KeyRound,
    label: "KEYS NEVER TOUCH A SERVER",
    body: (
      <>
        The key travels inside the QR link&apos;s <code>#fragment</code>,
        device to device. Browsers never send it over the network.
      </>
    ),
  },
  {
    icon: CloudOff,
    label: "NO ACCOUNTS, NO CLOUD",
    body: (
      <>
        Nothing to sign up for, nothing stored remotely. Everything lives in{" "}
        <code>~/.woodpecker/</code> on your own computer.
      </>
    ),
  },
];

/**
 * Animated architecture diagram (canvas → relay → your machine) where the
 * packet visibly encrypts leaving the canvas, crosses the relay as
 * ciphertext, and decrypts only on the user's machine, plus the
 * security-feature grid.
 */
export function SecuritySection() {
  return (
    <section id="security" className="lp-section">
      <p className="lp-kicker">HOW IT WORKS</p>
      <h2 className="lp-h2">
        A mindful way
        <br />
        <span className="lp-grad">to drive your agents.</span>
      </h2>
      <p className="lp-sub">
        You circle a note, it&apos;s encrypted on the canvas, and only your
        machine can decrypt it. Claude Code does the work there and the reply
        comes back the same way:
      </p>

      <div
        className="lp-pipe"
        aria-label="Diagram: your canvas and your machine exchange end-to-end encrypted messages through a relay that only sees ciphertext"
      >
        <div className="lp-pipe-nodes">
          <div className="lp-pipe-node lp-pipe-node--canvas">
            <div className="lp-pipe-mini" aria-hidden>
              <span className="lp-pipe-mini-gesture">
                <span className="lp-pipe-mini-note">hook up the payments</span>
                <svg className="lp-pipe-mini-circle" viewBox="0 0 340 92" preserveAspectRatio="none">
                  <path
                    pathLength={1}
                    d="M38,50 C30,18 128,6 202,9 C280,12 330,28 326,52 C322,79 218,90 128,86 C52,83 18,66 30,42 C36,30 52,22 68,19"
                  />
                </svg>
              </span>
              <span className="lp-pipe-mini-reply">✓ PR up · feat/payments</span>
            </div>
            <div className="lp-pipe-title">Your canvas</div>
            <div className="lp-pipe-sub">iPad / e-ink, any browser</div>
            <span className="lp-pipe-badge">🔑 holds the key</span>
          </div>
          <div className="lp-pipe-node lp-pipe-node--relay">
            <div className="lp-pipe-icon"><Radio size={20} strokeWidth={1.7} /></div>
            <div className="lp-pipe-title">Relay</div>
            <div className="lp-pipe-sub">relay.woodpeckeros.com</div>
            <span className="lp-pipe-badge lp-pipe-badge--nokey">no key · ciphertext only</span>
          </div>
          <div className="lp-pipe-node lp-pipe-node--machine">
            <div className="lp-pipe-term" aria-hidden>
              <div className="lp-pipe-term-bar">
                <em>claude code</em>
                <span className="lp-pipe-term-status">
                  <span className="lp-pipe-term-run">● processing</span>
                  <span className="lp-pipe-term-ok">✓ done</span>
                </span>
              </div>
              <pre>
                <span className="lp-tl lp-tl-1"><b>&gt;</b> query(&quot;hook up the payments&quot;)</span>
                <span className="lp-tl lp-tl-2">● Thinking…</span>
                <span className="lp-tl lp-tl-3">● Editing api/payments/route.ts</span>
                <span className="lp-tl lp-tl-4">● Running tests · 14 passed</span>
                <span className="lp-tl lp-tl-5">✓ PR up → feat/payments</span>
              </pre>
            </div>
            <div className="lp-pipe-title">Your machine</div>
            <div className="lp-pipe-sub">connector + Claude Code</div>
            <span className="lp-pipe-badge">🔑 holds the key</span>
          </div>
        </div>

        <div className="lp-pipe-lane" aria-hidden>
          <div className="lp-pipe-line" />
          <div className="lp-pipe-packet lp-pipe-out">
            <span className="lp-pipe-plain">✍️ &ldquo;hook up the payments&rdquo;</span>
            <span className="lp-pipe-cipher">🔒 9f2a·c41b·e07d</span>
          </div>
          <div className="lp-pipe-packet lp-pipe-back">
            <span className="lp-pipe-plain">🖋 &ldquo;PR up · feat/payments&rdquo;</span>
            <span className="lp-pipe-cipher">🔒 7e0d·91af·b3c2</span>
          </div>
        </div>

        <div className="lp-pipe-legend">
          <span>encrypted on <b>your canvas</b></span>
          <span>·</span>
          <span>opaque to <b>the relay</b></span>
          <span>·</span>
          <span>decrypted on <b>your machine</b></span>
        </div>
      </div>

      <div className="lp-sec-grid">
        {cards.map((card) => (
          <div key={card.label} className="lp-sec-card">
            <card.icon size={19} strokeWidth={1.7} />
            <div className="lp-sec-label">{card.label}</div>
            <p className="lp-sec-body">{card.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
