const items: Array<{ q: string; a: React.ReactNode }> = [
  {
    q: "Do I need an account or to paste in an API key?",
    a: (
      <>
        No. There are no accounts anywhere. The connector uses the Claude Code
        login already on your machine: Claude Pro/Max or an API key you&apos;ve
        configured locally. Nothing is ever typed into this website.
      </>
    ),
  },
  {
    q: "Where does the AI actually run?",
    a: (
      <>
        On your computer. This site serves only the drawing canvas; when you
        circle something, the request travels (encrypted) to the connector on
        your machine, which runs Claude Code with your files, your working
        directory, and your MCP tools.
      </>
    ),
  },
  {
    q: "What can woodpeckeros.com see?",
    a: (
      <>
        Nothing of yours. The site is fully static: no API routes, no
        database, no server-side code. Your ink, your tasks and your files
        never reach our infrastructure.
      </>
    ),
  },
  {
    q: "What does the relay see?",
    a: (
      <>
        Only ciphertext, and the fact that two peers are connected. Messages
        are AES-256-GCM encrypted in your browser and decrypted on your
        machine. The key is generated on your computer and shared with your
        tablet through the QR code&apos;s URL fragment, the part after{" "}
        <code>#</code>, which browsers never send over the network.
      </>
    ),
  },
  {
    q: "What if the relay were compromised?",
    a: (
      <>
        An attacker would get ciphertext and connection timing. No keys, no
        content. Replayed messages are rejected too: every message carries a
        per-device epoch and sequence number, so captured traffic can&apos;t be
        re-sent to trigger an action twice.
      </>
    ),
  },
  {
    q: "Can the agent damage my machine?",
    a: (
      <>
        Guardrails are on by default. Read-only tools run freely, but edits are
        confined to the folder you choose, and shell commands are checked
        against a destructive-command blocklist before they run. Every blocked
        action is shown on the canvas. If you want the guardrails off, that&apos;s
        an explicit <code>--yolo</code> flag. Your call, on your machine.
      </>
    ),
  },
  {
    q: "How do I revoke a pairing?",
    a: (
      <>
        Run <code>npx @woodpeckeros/connect --reset-pairing</code>. Your
        machine generates a fresh channel and key, and every previously paired
        device stops working instantly.
      </>
    ),
  },
  {
    q: "What devices does it work on?",
    a: (
      <>
        Any modern browser. It&apos;s designed for iPad with Apple Pencil and
        for e-ink tablets with a browser. For development or fully offline use
        on one machine, run the connector with <code>--local</code> and the
        canvas on localhost connects directly, no relay involved.
      </>
    ),
  },
];

/** FAQ accordion: native <details>, styled and animated with pure CSS. */
export function Faq() {
  return (
    <section id="faq" className="lp-section">
      <p className="lp-kicker">FAQ</p>
      <h2 className="lp-h2">Questions worth asking.</h2>
      <div className="lp-faq">
        {items.map((item) => (
          <details key={item.q}>
            <summary>{item.q}</summary>
            <div className="lp-faq-a">{item.a}</div>
          </details>
        ))}
      </div>
    </section>
  );
}
