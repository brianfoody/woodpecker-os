import type { Metadata } from "next";
import "./landing.css";
import { HeroCta } from "@/components/hero-cta";
import { LandingNav } from "@/components/landing/nav";
import { HeroDemo } from "@/components/landing/hero-demo";
import { Reveal } from "@/components/landing/reveal";
import { SecuritySection } from "@/components/landing/security";
import { QuickStart } from "@/components/landing/quick-start";

export const metadata: Metadata = {
  title: "Woodpecker OS: drive Claude Code with a pen",
  description:
    "Turn an iPad or e-ink display into mission control for the Claude Code on your machine. Run agentic tasks in parallel on an infinite canvas, no terminal juggling, sessions that resume with a circle. End-to-end encrypted, no accounts, no cloud execution.",
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
              Drive Claude
              <br />
              <span className="lp-grad">with a pen.</span>
            </h1>
            <p className="lp-lede">
              Woodpecker turns an iPad or e-ink display into mission control for
              the Claude Code running on <em>your</em> machine. Run agentic
              tasks side by side on an infinite canvas.
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
            <p className="lp-kicker">BUILT FOR REAL WORK</p>
            <h2 className="lp-h2">
              Writing code is no longer the bottleneck.
              <br />
              <span className="lp-grad">Clarity of thought is.</span>
            </h2>
            <p className="lp-sub">
              Handwriting slows you down on purpose. What you write by hand,
              you remember — so while your agents produce code faster than you
              can read it, you stay the one who actually tracks what&apos;s
              being built.
            </p>
            <blockquote className="lp-quote-big">
              &ldquo;You are doomed when your imagination exceeds your capacity
              to remember.&rdquo;
            </blockquote>
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
            note about the smallest of life&apos;s mysteries. A mind with room
            to wonder, and the tools to chase it. That&apos;s the whole product.
          </p>
        </div>
        <div className="lp-footer-bar">
          <span>WOODPECKER_OS</span>
          <a
            href="https://github.com/brianfoody/woodpecker-os"
            target="_blank"
            rel="noreferrer"
          >
            GITHUB
          </a>
          <span>YOUR MACHINE · YOUR KEYS · YOUR INK</span>
        </div>
      </footer>
    </div>
  );
}
