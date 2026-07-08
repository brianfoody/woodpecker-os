import { Feather } from "lucide-react";
import { GitHubStarButton } from "@/components/landing/github-star";

export function LandingNav() {
  return (
    <nav className="lp-nav">
      <div className="lp-nav-inner">
        <a href="#top" className="lp-logo" aria-label="Woodpecker OS home">
          <Feather size={15} strokeWidth={1.8} />
          WOODPECKER_OS
        </a>
        <div className="lp-nav-links">
          <a href="#gesture">Why a pen</a>
          <a href="#security">How it works</a>
          <GitHubStarButton />
          <a href="#start" className="lp-nav-cta">
            <span className="lp-nav-cta-full">npx @woodpeckeros/connect</span>
            <span className="lp-nav-cta-short">get started</span>
          </a>
        </div>
      </div>
    </nav>
  );
}
