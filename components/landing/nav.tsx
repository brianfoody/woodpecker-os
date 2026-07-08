import { Feather } from "lucide-react";

export function LandingNav() {
  return (
    <nav className="lp-nav">
      <div className="lp-nav-inner">
        <a href="#top" className="lp-logo" aria-label="Woodpecker OS home">
          <Feather size={15} strokeWidth={1.8} />
          WOODPECKER_OS
        </a>
        <div className="lp-nav-links">
          <a href="#gesture">The gesture</a>
          <a href="#security">Security</a>
          <a href="#faq">FAQ</a>
          <a href="#start" className="lp-nav-cta">
            <span className="lp-nav-cta-full">npx @woodpeckeros/connect</span>
            <span className="lp-nav-cta-short">get started</span>
          </a>
        </div>
      </div>
    </nav>
  );
}
