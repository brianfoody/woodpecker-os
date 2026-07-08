/**
 * Looping demo of the product's core gesture, pure CSS/SVG:
 * a handwritten note wipes in, the magic pen circles it,
 * and the agent's reply appears back in ink on the paper.
 */
export function HeroDemo() {
  return (
    <div className="lp-demo" aria-label="Demo: handwrite a note, circle it with the magic pen, and the agent replies in ink">
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
            <div className="lp-demo-reply">
              <p className="lp-demo-reply-hand">
                Wired Stripe into /api/payments: checkout session, webhook
                handler, and 14 passing tests. Branch pushed, PR is up.
              </p>
              <p className="lp-demo-reply-meta">
                <b>✓</b> ran on your machine &nbsp;·&nbsp; branch → feat/payments
              </p>
            </div>
          </div>
        </div>
      </div>
      <p className="lp-demo-caption">WRITE · CIRCLE · DONE. THAT&apos;S THE WHOLE INTERFACE</p>
    </div>
  );
}
