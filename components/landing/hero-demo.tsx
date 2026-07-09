/**
 * Looping demo of the product's core gesture, pure CSS/SVG — two rounds
 * of the conversation: a handwritten note wipes in, the magic pen circles
 * it, a pulsing status line tracks the agent, and the reply lands in ink.
 * Then a follow-up is handwritten, the reply + follow-up get circled
 * together, and a second session answers — same 12s cadence, one act
 * after the other (act 2 reuses act 1's status keyframes with a 12s
 * animation-delay; see landing.css).
 */
export function HeroDemo() {
  return (
    <div className="lp-demo" aria-label="Demo: handwrite a note, circle it with the magic pen, and the agent replies in ink. Circle the reply with a follow-up note to keep the conversation going.">
      <div className="lp-demo-frame">
        <div className="lp-demo-inner">
          <div className="lp-demo-toolbar">
            <span className="lp-demo-tool">✎</span>
            <span className="lp-demo-tool lp-demo-tool--active" title="magic pen">✦</span>
            <span className="lp-demo-tool">◻</span>
            <em>YOUR CANVAS</em>
          </div>
          <div className="lp-demo-paper">
            <span className="lp-demo-gesture">
              <p className="lp-demo-note">okay let&apos;s hook up the payments to our app</p>
              <svg className="lp-demo-circle" viewBox="0 0 340 92" preserveAspectRatio="none" aria-hidden>
                <path
                  pathLength={1}
                  d="M38,50 C30,18 128,6 202,9 C280,12 330,28 326,52 C322,79 218,90 128,86 C52,83 18,66 30,42 C36,30 52,22 68,19"
                />
              </svg>
            </span>
            <span className="lp-demo-gesture lp-demo-gesture--2">
              <span className="lp-demo-slot">
                <span className="lp-demo-status" aria-hidden>
                  <span className="lp-hst lp-hst-1">✦ thinking…</span>
                  <span className="lp-hst lp-hst-2">✦ editing api/payments/route.ts</span>
                  <span className="lp-hst lp-hst-3">✦ running tests…</span>
                  <span className="lp-hst lp-hst-4">✦ writing reply…</span>
                </span>
                <div className="lp-demo-reply">
                  <p className="lp-demo-reply-hand">
                    Wired Stripe into /api/payments — checkout session, webhook
                    handler, 14 passing tests. PR is up.
                  </p>
                  <p className="lp-demo-reply-meta">
                    <b>✓</b> ran on your machine &nbsp;·&nbsp; branch → feat/payments
                  </p>
                </div>
              </span>
              <p className="lp-demo-note lp-demo-note--2">nice, add refunds too</p>
              <svg className="lp-demo-circle lp-demo-circle--2" viewBox="0 0 340 92" preserveAspectRatio="none" aria-hidden>
                <path
                  pathLength={1}
                  d="M30,46 C38,16 140,4 214,8 C292,12 334,30 328,54 C320,82 210,92 118,87 C46,83 12,64 26,40 C33,28 50,20 66,17"
                />
              </svg>
            </span>
            <span className="lp-demo-slot lp-demo-slot--2">
              <span className="lp-demo-status lp-demo-status--2" aria-hidden>
                <span className="lp-hst lp-hst-1">✦ thinking…</span>
                <span className="lp-hst lp-hst-2">✦ editing api/refunds/route.ts</span>
                <span className="lp-hst lp-hst-3">✦ running tests…</span>
                <span className="lp-hst lp-hst-4">✦ writing reply…</span>
              </span>
              <div className="lp-demo-reply lp-demo-reply--2">
                <p className="lp-demo-reply-hand">
                  Refunds wired in — /api/refunds plus 6 new tests, all green.
                  Pushed to the same PR.
                </p>
                <p className="lp-demo-reply-meta">
                  <b>✓</b> ran on your machine &nbsp;·&nbsp; same session, same branch
                </p>
              </div>
            </span>
          </div>
        </div>
      </div>
      <p className="lp-demo-caption">WRITE · CIRCLE · DONE — CIRCLE THE REPLY TO GO AGAIN</p>
    </div>
  );
}
