import { CopyCommandButton } from "@/components/landing/copy-command";

/** Fake-but-plausible pairing QR, deterministic pattern (no data encoded). */
function PairQr() {
  const size = 17;
  const cells: React.ReactNode[] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const finder =
        (r < 7 && c < 7) || (r < 7 && c > 9) || (r > 9 && c < 7);
      let on: boolean;
      if (finder) {
        const rr = r < 7 ? r : r - 10;
        const cc = c < 7 ? c : c - 10;
        on =
          rr === 0 || rr === 6 || cc === 0 || cc === 6 ||
          (rr >= 2 && rr <= 4 && cc >= 2 && cc <= 4);
      } else {
        on = (r * 7 + c * 13 + r * c) % 9 < 4;
      }
      if (on) cells.push(<rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} />);
    }
  }
  return (
    <svg width={72} height={72} viewBox={`0 0 ${size} ${size}`} fill="#161b26" aria-hidden>
      {cells}
    </svg>
  );
}

const steps = [
  {
    n: "1",
    title: "Run the connector",
    body: (
      <>
        On your computer: <code>npx @woodpeckeros/connect</code>. It finds your
        existing Claude Code login and generates an encryption key that never
        leaves the machine.
      </>
    ),
  },
  {
    n: "2",
    title: "Confirm the working folder",
    body: (
      <>
        It asks which folder Claude Code should work in, every time it starts.
        That folder is the agent&apos;s whole world: edits and writes are
        confined to it by the guardrails. Point it at a repo, a notes folder,
        whatever you&apos;re working on (or skip the prompt with{" "}
        <code>--dir</code>).
      </>
    ),
  },
  {
    n: "3",
    title: "Scan the QR from your tablet",
    body: "Point your iPad or e-ink browser at the code it prints. That's the pairing: the key travels inside the link fragment, device to device.",
  },
  {
    n: "4",
    title: "Write, pick the magic pen, circle",
    body: "That's the whole interface. Your agent reads what's inside the circle, does the work, and writes back in ink.",
  },
];

export function QuickStart() {
  return (
    <section id="start" className="lp-section">
      <p className="lp-kicker">GET STARTED</p>
      <h2 className="lp-h2">Set it up once, in about a minute.</h2>
      <p className="lp-sub">
        No account, no signup, no API key pasted into a website. It uses the
        Claude Code login already on your machine — Claude Pro/Max or your own
        key.
      </p>

      <div className="lp-steps">
        <div>
          {steps.map((step) => (
            <div key={step.n} className="lp-step">
              <span className="lp-step-n">{step.n}</span>
              <div>
                <div className="lp-step-title">{step.title}</div>
                <p className="lp-step-body">{step.body}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="lp-term" aria-label="Terminal showing the connector starting up and printing a pairing QR code">
          <div className="lp-term-bar">
            <span className="lp-term-dot" />
            <span className="lp-term-dot" />
            <span className="lp-term-dot" />
            <em>YOUR TERMINAL</em>
            <CopyCommandButton
              className="lp-term-copy"
              idle={<>⧉ copy command</>}
              copied={<>✓ copied</>}
            />
          </div>
          <pre>
<span className="prompt">$</span> npx @woodpeckeros/connect{"\n"}
{"\n"}
<span className="dim">Which folder should Claude Code work in?</span> <span className="ok">~/code/myapp</span>{"\n"}
{"\n"}
<span className="ok">✓</span> Claude Code found · using your login{"\n"}
<span className="ok">✓</span> guardrails on · edits stay inside <span className="dim">~/code/myapp</span>{"\n"}
<span className="ok">✓</span> key generated <span className="dim">· never leaves this machine</span>{"\n"}
{"\n"}
<span className="dim">scan from your tablet to pair ↴</span>
          </pre>
          <div className="lp-term-qr">
            <PairQr />
            <div className="lp-term-qr-text">
              <b>https://woodpeckeros.com/pair#••••••••</b>
              <br />
              key travels in the <b>#fragment</b>, servers never see it
              <br />
              waiting for your canvas <span className="lp-caret">▍</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
