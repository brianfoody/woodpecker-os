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
              <p className="lp-demo-note">describe the tongue of a woodpecker</p>
              <svg className="lp-demo-circle" viewBox="0 0 340 92" preserveAspectRatio="none" aria-hidden>
                <path
                  pathLength={1}
                  d="M38,50 C30,18 128,6 202,9 C280,12 330,28 326,52 C322,79 218,90 128,86 C52,83 18,66 30,42 C36,30 52,22 68,19"
                />
              </svg>
            </span>
            <div className="lp-demo-reply">
              <p className="lp-demo-reply-hand">
                It wraps all the way around the skull, a built-in shock absorber
                for 20 strikes a second. Da Vinci asked the same thing in 1508.
              </p>
              <p className="lp-demo-reply-meta">
                <b>✓</b> answered on your machine &nbsp;·&nbsp; saved → notes/woodpecker.md
              </p>
            </div>
          </div>
        </div>
      </div>
      <p className="lp-demo-caption">WRITE · CIRCLE · DONE. THAT&apos;S THE WHOLE INTERFACE</p>
    </div>
  );
}
