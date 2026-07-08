import {
  CloudOff,
  Globe,
  KeyRound,
  Laptop,
  Lock,
  PenLine,
  Radio,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";

const cards = [
  {
    icon: Lock,
    label: "END-TO-END ENCRYPTED",
    body: "Every message between canvas and machine is AES-256-GCM encrypted in your browser and only decrypted on your computer. The relay in between forwards bytes it cannot read.",
  },
  {
    icon: KeyRound,
    label: "KEYS NEVER TOUCH A SERVER",
    body: (
      <>
        Your machine generates the key and shares it via the QR code&apos;s URL
        fragment, the part after <code>#</code>, which browsers never send
        over the network. It exists only on your devices.
      </>
    ),
  },
  {
    icon: CloudOff,
    label: "NO ACCOUNTS, NO CLOUD",
    body: (
      <>
        Nothing to sign up for, nothing stored remotely. Pairing, canvas
        snapshots and config live in <code>~/.woodpecker/</code> on your own
        computer.
      </>
    ),
  },
  {
    icon: Globe,
    label: "A STATIC SITE, ON PURPOSE",
    body: "woodpeckeros.com is a static page with zero API routes and no database. There is no server holding your notes, files or keys to attack.",
  },
  {
    icon: ShieldCheck,
    label: "GUARDRAILS BY DEFAULT",
    body: "The agent only edits inside the folder you choose, and destructive shell commands are blocked before they run. Every denial is shown right on the canvas.",
  },
  {
    icon: RotateCcw,
    label: "REPLAY PROTECTION",
    body: "Messages carry per-device epoch and sequence numbers, so captured ciphertext can't be replayed later to trigger an action twice.",
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
        Your machine does the work.
        <br />
        <span className="lp-grad">Nothing else can read it.</span>
      </h2>
      <p className="lp-sub">
        This site is just the canvas. The intelligence runs on your computer:
        your Claude login, your files, your tools. Between them sits a relay
        that only ever sees ciphertext:
      </p>

      <div
        className="lp-pipe"
        aria-label="Diagram: your canvas and your machine exchange end-to-end encrypted messages through a relay that only sees ciphertext"
      >
        <div className="lp-pipe-nodes">
          <div className="lp-pipe-node">
            <div className="lp-pipe-icon"><PenLine size={20} strokeWidth={1.7} /></div>
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
          <div className="lp-pipe-node">
            <div className="lp-pipe-icon"><Laptop size={20} strokeWidth={1.7} /></div>
            <div className="lp-pipe-title">Your machine</div>
            <div className="lp-pipe-sub">connector + Claude Code</div>
            <span className="lp-pipe-badge">🔑 holds the key</span>
          </div>
        </div>

        <div className="lp-pipe-lane" aria-hidden>
          <div className="lp-pipe-line" />
          <div className="lp-pipe-packet lp-pipe-out">
            <span className="lp-pipe-plain">✍️ &ldquo;fix the login bug&rdquo;</span>
            <span className="lp-pipe-cipher">🔒 9f2a·c41b·e07d</span>
          </div>
          <div className="lp-pipe-packet lp-pipe-back">
            <span className="lp-pipe-plain">🖋 reply, in ink</span>
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
