import { Feather } from "lucide-react";
import { CopyCommandButton } from "@/components/landing/copy-command";
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
          <CopyCommandButton
            href="#start"
            className="lp-nav-cta"
            idle={
              <>
                <span className="lp-nav-cta-full">npx @woodpeckeros/connect</span>
                <span className="lp-nav-cta-short">get started</span>
              </>
            }
            copied={
              <>
                <span className="lp-nav-cta-full">✓ copied — paste in terminal</span>
                <span className="lp-nav-cta-short">✓ copied</span>
              </>
            }
          />
        </div>
      </div>
    </nav>
  );
}
