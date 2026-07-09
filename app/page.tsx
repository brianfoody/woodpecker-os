import type { Metadata } from "next";
import "./landing.css";
import { HeroCta } from "@/components/hero-cta";
import { LandingNav } from "@/components/landing/nav";
import { HeroDemo } from "@/components/landing/hero-demo";
import { Reveal } from "@/components/landing/reveal";
import { SecuritySection } from "@/components/landing/security";
import { QuickStart } from "@/components/landing/quick-start";

export const metadata: Metadata = {
  title: "Woodpecker OS: drive Claude Code from a notepad",
  description:
    "Write a note by hand, circle it, and Claude Code picks it up on your own machine. No terminal, no tab juggling — agents run where your files already are, and you resume any one by circling its reply. End-to-end encrypted, no accounts, nothing runs in the cloud.",
};

export default function Landing() {
  return (
    <div className="lp" id="top">
      <div className="lp-bg" aria-hidden />
      <LandingNav />

      <main>
        {/* Hero */}
        <header className="lp-hero">
          <div>
            <p className="lp-kicker">WOODPECKER OS</p>
            <h1 className="lp-h1">
              Drive Claude Code from a{" "}
              <span className="lp-grad">notepad</span>.
            </h1>
            <p className="lp-lede">
              You write a note by hand, circle it, and Claude Code picks it up
              on your own machine. No terminal, no tab juggling. The work runs
              where your files already are, and you stay on a surface that
              isn&apos;t competing for your attention.
            </p>
            <HeroCta />
            <p className="lp-trust">
              <span>No accounts</span>
              <span>End-to-end encrypted</span>
              <span>Runs on your machine</span>
            </p>
          </div>
          <Reveal delay={150}>
            <HeroDemo />
          </Reveal>
        </header>

        {/* How it works + security */}
        <Reveal>
          <SecuritySection />
        </Reveal>

        {/* Built for real work */}
        <Reveal>
          <section id="gesture" className="lp-section">
            <p className="lp-kicker">WHY A PEN</p>
            <h2 className="lp-h2">
              The typing was never
              <br />
              <span className="lp-grad">the hard part.</span>
            </h2>
            <p className="lp-sub">
              Agents now write code faster than you can read it. So the real
              work isn&apos;t producing lines anymore — it&apos;s holding the
              shape of what you&apos;re building in your head. Writing by hand is
              slow on purpose. What you write down, you remember, and you stay
              the one who knows what&apos;s actually going on.
            </p>
          </section>
        </Reveal>

        {/* Quick start */}
        <Reveal>
          <QuickStart />
        </Reveal>
      </main>

      {/* Footer */}
      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <p className="lp-footer-quote">
            &ldquo;describe the tongue of a woodpecker&rdquo;
          </p>
          <p className="lp-footer-attr">
            LEONARDO DA VINCI, NOTEBOOK ENTRY, C. 1508
          </p>
          <p className="lp-footer-story">
            Five hundred years ago, the most curious mind alive left himself a
            note about one of the smallest mysteries in life. Room to wonder,
            and the tools to chase it down. That&apos;s the whole product.
          </p>
        </div>
        <div className="lp-footer-bar">
          <span>WOODPECKER_OS</span>
          <a
            href="https://github.com/brianfoody/woodpecker-os"
            target="_blank"
            rel="noreferrer"
          >
            ★ STAR US ON GITHUB
          </a>
          <span>YOUR MACHINE · YOUR KEYS · YOUR INK</span>
        </div>
      </footer>
    </div>
  );
}
