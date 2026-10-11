"use client";

/**
 * The hero: a page of handwriting that quietly comes alive. Same dot, pill
 * and answer styles as the real notebook (notebook.css), driven by a script
 * instead of an agent.
 */

import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";

type Step = {
  at: number;
  lines: number; // how many lines are written
  reading?: boolean;
  gym?: "reading" | "quiet";
  email?: "idle" | "working" | "ready" | "tap" | "running" | "done";
  q?: "idle" | "working" | "answered";
  emailProgress?: string;
  qProgress?: string;
};

const LINES = ["Sunday", "gym, then the market", "email Sam re: Friday's invoice", "what time does Bunnings close?"];

const SCRIPT: Step[] = [
  { at: 0, lines: 0 },
  { at: 500, lines: 1 },
  { at: 1500, lines: 2 },
  { at: 2700, lines: 3 },
  { at: 4300, lines: 4 },
  { at: 6000, lines: 4, reading: true },
  { at: 7300, lines: 4, gym: "quiet", email: "working", q: "working", emailProgress: "search threads · gmail", qProgress: "searching “bunnings hours”" },
  { at: 8700, lines: 4, gym: "quiet", email: "working", q: "working", emailProgress: "drafting", qProgress: "reading bunnings.com.au" },
  { at: 9900, lines: 4, gym: "quiet", email: "working", q: "answered", emailProgress: "drafting" },
  { at: 10900, lines: 4, gym: "quiet", email: "ready", q: "answered" },
  { at: 13200, lines: 4, gym: "quiet", email: "tap", q: "answered" },
  { at: 13600, lines: 4, gym: "quiet", email: "running", q: "answered", emailProgress: "send message · gmail" },
  { at: 15000, lines: 4, gym: "quiet", email: "done", q: "answered" },
  { at: 19500, lines: 4, gym: "quiet", email: "done", q: "answered" },
];
const LOOP_MS = 20500;

export function LiveDemo() {
  const [step, setStep] = useState<Step>(SCRIPT[0]);
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setStep(SCRIPT[SCRIPT.length - 1]);
      return;
    }
    const timers = SCRIPT.map((s) => setTimeout(() => setStep(s), s.at));
    const loop = setTimeout(() => setCycle((c) => c + 1), LOOP_MS);
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(loop);
    };
  }, [cycle]);

  return (
    <div className="hm-demo nb-tokens" aria-label="A handwritten to-do list with the assistant's dots appearing beside two lines">
      <div className="hm-demo-head">
        <span className="hm-demo-day">Sunday</span>
        <span className="hm-demo-pill">
          <span className="nb-live-dot" /> Agent · cloud
        </span>
      </div>
      <div className="hm-demo-page" key={cycle}>
        {LINES.slice(1).map((text, i) => {
          const n = i + 2; // line number in script terms
          const written = step.lines >= n;
          const reading = step.reading && written;
          return (
            <div className="hm-row" key={text}>
              <span
                className={`hm-ink${written ? " is-written" : ""}${reading ? " is-reading" : ""}`}
                style={{ ["--chars" as string]: text.length }}
              >
                {text}
              </span>
              {n === 2 && reading && <span className="nb-dot nb-dot--reading hm-dot"><span className="nb-dot-core nb-dot-core--faint" /></span>}
              {n === 3 && <EmailDot step={step} />}
              {n === 4 && <QuestionDot step={step} />}
            </div>
          );
        })}
        <div className="hm-row" />
        <div className="hm-row" />
      </div>
      <p className="hm-demo-caption">
        {captionFor(step)}
      </p>
    </div>
  );
}

function captionFor(s: Step): string {
  if (s.lines < 4) return "You write your day. Nothing happens.";
  if (s.reading) return "You pause. It reads along…";
  if (s.email === "working") return "“gym” is just a note, so it stays quiet. The other two get a mark in the margin.";
  if (s.email === "ready") return "The answer comes back. The email waits for your tick.";
  if (s.email === "tap" || s.email === "running") return "Tick. Now, and only now, it sends.";
  return "That's the whole loop.";
}

function EmailDot({ step }: { step: Step }) {
  if (step.reading) return <span className="nb-dot hm-dot"><span className="nb-dot-core nb-dot-core--faint" /></span>;
  switch (step.email) {
    case "working":
    case "running":
      return (
        <span className="nb-dot hm-dot">
          <span className="nb-trio"><i /><i /><i /></span>
          <span className="nb-dot-label">{step.emailProgress}</span>
        </span>
      );
    case "ready":
    case "tap":
      return (
        <span className="nb-dot hm-dot">
          <span className="nb-dot-core nb-dot-core--ready" />
          <span className="nb-pill">
            <span className="nb-pill-title">Email Sam · invoice</span>
            <span className={`nb-pill-btn nb-pill-btn--go${step.email === "tap" ? " hm-tap" : ""}`}>
              <Check size={15} strokeWidth={3} />
            </span>
            <span className="nb-pill-btn"><X size={14} strokeWidth={2.5} /></span>
          </span>
        </span>
      );
    case "done":
      return (
        <span className="nb-dot hm-dot">
          <span className="nb-dot-core nb-dot-core--done"><Check size={10} strokeWidth={4} /></span>
          <span className="nb-hand nb-answer nb-answer--done hm-write">sent to sam@harbourco.com</span>
        </span>
      );
    default:
      return null;
  }
}

function QuestionDot({ step }: { step: Step }) {
  if (step.reading) return <span className="nb-dot hm-dot"><span className="nb-dot-core nb-dot-core--faint" /></span>;
  if (step.q === "working")
    return (
      <span className="nb-dot hm-dot">
        <span className="nb-trio"><i /><i /><i /></span>
        <span className="nb-dot-label">{step.qProgress}</span>
      </span>
    );
  if (step.q === "answered")
    return (
      <span className="nb-dot hm-dot">
        <span className="nb-dot-core" />
        <span className="nb-hand nb-answer hm-write">7pm tonight</span>
      </span>
    );
  return null;
}
