import type { Metadata } from "next";
import { CircleDashed, GitBranch, MessageCircleQuestion, Wrench } from "lucide-react";
import "./landing.css";
import { HeroCta } from "@/components/hero-cta";
import { LandingNav } from "@/components/landing/nav";
import { HeroDemo } from "@/components/landing/hero-demo";
import { Reveal } from "@/components/landing/reveal";
import { SecuritySection } from "@/components/landing/security";
import { QuickStart } from "@/components/landing/quick-start";
import { Faq } from "@/components/landing/faq";

export const metadata: Metadata = {
  title: "Woodpecker OS: drive Claude Code with a pen",
  description:
    "Turn an iPad or e-ink display into a handwriting interface for the Claude Code on your machine. Write, circle, and your agent does the work. End-to-end encrypted, no accounts, no cloud execution.",
};

const gestures = [
  {
    n: "01",
    icon: CircleDashed,
    title: "Circle a task. It gets done.",
    body: "Handwrite “scaffold the API for the invoices feature” and circle it. Claude Code runs on your machine: reads your repo, edits files, runs commands, and streams what it's doing back onto the canvas.",
  },
  {
    n: "02",
    icon: MessageCircleQuestion,
    title: "Circle a question. It gets answered.",
    body: "Sketch an idea, circle it, and get a researched reply written back in handwriting beside your notes. Everything Claude sees is exactly what's inside your circle.",
  },
  {
    n: "03",
    icon: GitBranch,
    title: "Circle a reply. The thread continues.",
    body: "Every response is a fork point. Circle any reply to branch the session from that exact moment and explore three directions without them contaminating each other.",
  },
  {
    n: "04",
    icon: Wrench,
    title: "Your tools come with it.",
    body: "The agent inherits your Claude Code setup: your login, your working directory, your MCP servers. If your terminal Claude can do it, your pen can too.",
  },
];

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
              Drive Claude Code
              <br />
              <span className="lp-grad">with a pen.</span>
            </h1>
            <p className="lp-lede">
              Woodpecker turns an iPad or e-ink display into a handwriting
              interface for the Claude Code running on <em>your</em> machine.
              Write a thought and circle it with the magic pen. Your agent
              reads it, does the work with your files and your tools, and
              writes back in ink.
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

        {/* The gesture */}
        <Reveal>
          <section id="gesture" className="lp-section">
            <p className="lp-kicker">ONE GESTURE</p>
            <h2 className="lp-h2">Circle it. That&apos;s the interface.</h2>
            <p className="lp-sub">
              No prompt box, no chat window, no app switcher. Everything the
              agent sees is exactly what you put inside the circle.
            </p>
            <div className="lp-cards">
              {gestures.map((item) => (
                <div key={item.n} className="lp-card">
                  <div className="lp-card-head">
                    <span className="lp-card-n">{item.n}</span>
                    <item.icon size={18} strokeWidth={1.7} />
                  </div>
                  <h3 className="lp-card-title">{item.title}</h3>
                  <p className="lp-card-body">{item.body}</p>
                </div>
              ))}
            </div>
          </section>
        </Reveal>

        {/* Manifesto */}
        <Reveal>
          <section className="lp-manifesto">
            <p className="lp-kicker">WHY A PEN</p>
            <p className="lp-manifesto-big">
              The best thinking happens away from the feed. This isn&apos;t a
              notepad app. <span className="lp-grad">It&apos;s a command line made of ink.</span>
            </p>
            <p>
              The moment you reach for the phone to &ldquo;just check one
              thing,&rdquo; the morning is gone. Woodpecker gives you the
              leverage of your agent without opening the machine of
              distraction: paper-like calm on one side, full Claude Code on the
              other.
            </p>
          </section>
        </Reveal>

        {/* How it works + security */}
        <Reveal>
          <SecuritySection />
        </Reveal>

        {/* Quick start */}
        <Reveal>
          <QuickStart />
        </Reveal>

        {/* FAQ */}
        <Reveal>
          <Faq />
        </Reveal>
      </main>

      {/* Footer */}
      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <p className="lp-footer-quote">&ldquo;describe the tongue of a woodpecker&rdquo;</p>
          <p className="lp-footer-attr">LEONARDO DA VINCI, NOTEBOOK ENTRY, C. 1508</p>
          <p className="lp-footer-story">
            Five hundred years ago, the most curious mind alive left himself a
            note about the smallest of life&apos;s mysteries. A mind with room
            to wonder, and the tools to chase it. That&apos;s the whole
            product.
          </p>
        </div>
        <div className="lp-footer-bar">
          <span>WOODPECKER_OS</span>
          <span>YOUR MACHINE · YOUR KEYS · YOUR INK</span>
        </div>
      </footer>
    </div>
  );
}
