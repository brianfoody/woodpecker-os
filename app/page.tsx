import type { Metadata } from "next";
import "./home.css";
import "@/components/notebook/notebook.css";
import { ArrowRight, Cloud, Lock, Mic, PenLine, Sparkles, Check } from "lucide-react";
import { LiveDemo } from "@/components/home/live-demo";
import { InstallCard } from "@/components/home/install-card";
import { CopyLine } from "@/components/home/copy-line";

export const metadata: Metadata = {
  title: "Woodpecker: a notebook that reads along",
  description:
    "Write your day by hand or say it out loud. When a line needs doing, a small mark appears in the margin and quietly gets it ready. Nothing happens until you tick. Your own always-on Claude agent, hosted for you.",
};

function Logo() {
  return (
    <svg width="30" height="30" viewBox="0 0 512 512" aria-hidden>
      <path
        d="M112 262 C 140 214, 156 214, 168 250 S 196 300, 214 252 S 246 200, 262 248 S 292 296, 312 250"
        fill="none"
        stroke="currentColor"
        strokeWidth="34"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="390" cy="248" r="40" fill="#7c5cff" />
    </svg>
  );
}

export default function Home() {
  return (
    <div className="hm">
      <nav className="hm-nav">
        <a href="#top" className="hm-logo">
          <Logo />
          Woodpecker
        </a>
        <div className="hm-nav-links">
          <a href="#how">How it feels</a>
          <a href="#agent">Your agent</a>
          <a href="#install">Install</a>
          <a className="hm-btn hm-btn--small hm-btn--ink" href="/notebook">
            Open notebook
          </a>
        </div>
      </nav>

      <main id="top">
        <header className="hm-hero">
          <div className="hm-hero-copy">
            <p className="hm-kicker">For people who think on paper</p>
            <h1 className="hm-h1">
              A notebook that <span className="hm-hand">reads along.</span>
            </h1>
            <p className="hm-lede">
              Write your day by hand, or hold your finger down and say it. When a line needs doing,
              a small mark appears in the margin and quietly gets it ready: the email drafted, the answer
              found. <strong>Nothing happens until you tick.</strong>
            </p>
            <div className="hm-cta">
              <a className="hm-btn hm-btn--ink" href="/notebook">
                Start writing <ArrowRight size={17} />
              </a>
              <a className="hm-btn" href="#install">
                Put it on your iPad
              </a>
            </div>
            <p className="hm-fine">Free during beta · we host your agent, you bring your Claude plan</p>
          </div>
          <LiveDemo />
        </header>

        <section id="how" className="hm-section">
          <p className="hm-kicker">How it feels</p>
          <h2 className="hm-h2">Less like chatting with a bot. More like a good assistant reading over your shoulder.</h2>
          <div className="hm-grid3">
            <article className="hm-card">
              <div className="hm-card-ico"><PenLine size={20} /></div>
              <h3>Write, or speak</h3>
              <p>
                Pencil for when you&apos;re thinking. Press and hold anywhere to talk when you&apos;re
                not. Your words stream onto the line as you say them. Switch whenever you like.
              </p>
            </article>
            <article className="hm-card">
              <div className="hm-card-ico"><span className="hm-dot-ico" /></div>
              <h3>Margin notes, not replies</h3>
              <p>
                No chat window. It reads each line when you pause. Most lines are just you thinking,
                and it stays quiet. When one asks for something, a mark appears beside it and gets to work.
              </p>
            </article>
            <article className="hm-card">
              <div className="hm-card-ico"><Check size={20} /></div>
              <h3>Always a draft</h3>
              <p>
                Questions get answered right there in the margin. Anything that touches the world
                (an email, an invite, a booking) waits as a draft until you give it a tick.
              </p>
            </article>
          </div>
        </section>

        <section className="hm-section hm-learn">
          <div>
            <p className="hm-kicker">It learns when to stay quiet</p>
            <h2 className="hm-h2">Wave it off, tell it why.</h2>
            <p className="hm-sub">
              Say it or scribble it: <em>&ldquo;I&apos;ll call Mum myself.&rdquo;</em> Every tick and every
              &ldquo;not this&rdquo; feeds the little classifier that decides when to step in, so it
              gets quieter where you want quiet. Everything it has learned is kept with your agent, where you can read it and delete it.
            </p>
          </div>
          <div className="hm-why nb-tokens">
            <div className="hm-why-line">
              <span className="hm-hand">call mum about Sunday lunch</span>
              <span className="nb-dot-core nb-dot-core--cancelled" />
            </div>
            <div className="hm-why-sheet">
              <div className="hm-why-title">Got it. Why not?</div>
              <div className="hm-why-chips">
                <span>I&apos;ll do this one myself</span>
                <span>Just a note to self</span>
                <span>Not now</span>
              </div>
              <div className="hm-why-talk">
                <Mic size={16} /> &ldquo;I like calling her myself, don&apos;t draft it&rdquo;
              </div>
            </div>
            <div className="hm-why-learned">
              <Sparkles size={14} /> Next time: personal calls stay notes.
            </div>
          </div>
        </section>

        <section id="agent" className="hm-section">
          <p className="hm-kicker">Your agent, always on</p>
          <h2 className="hm-h2">We run the agent. You bring your Claude plan.</h2>
          <p className="hm-sub">
            Behind the notebook is a real Claude Code agent with web search, files and tools. We host a
            private one for you in the cloud, so it&apos;s there whenever you pick up your iPad, with
            nothing left running on your laptop. It runs on <strong>your own Claude Pro or Max
            plan</strong>.
          </p>
          <div className="hm-deploy">
            <ol className="hm-deploy-steps">
              <li>
                <span className="hm-step-n">1</span>
                <div>
                  <strong>Start your agent</strong>
                  <p>Open the notebook and tap <em>Start my agent</em>. It&apos;s up in a few seconds, with its own private container and storage.</p>
                </div>
              </li>
              <li>
                <span className="hm-step-n">2</span>
                <div>
                  <strong>Connect Claude</strong>
                  <p>Run <code>claude setup-token</code> on any computer and paste the token. It&apos;s encrypted on your device and sent straight to your agent.</p>
                </div>
              </li>
              <li>
                <span className="hm-step-n">3</span>
                <div>
                  <strong>Bring your iPad</strong>
                  <p>Scan the QR on your agent&apos;s page and the iPad opens the same notebook, already connected.</p>
                </div>
              </li>
            </ol>
            <aside className="hm-price">
              <div className="hm-price-n">
                Free<span> during beta</span>
              </div>
              <p>Invite only while we grow. Claude usage comes out of your own plan, just like Claude Code.</p>
              <a className="hm-btn hm-btn--ink hm-btn--wide" href="/notebook?setup=cloud">
                <Cloud size={17} /> Start my agent
              </a>
              <p className="hm-fine">Rather keep it on your own machine?</p>
              <CopyLine text="npx @woodpeckeros/connect" />
            </aside>
          </div>
        </section>

        <section id="install" className="hm-section hm-install-section">
          <div>
            <p className="hm-kicker">Install</p>
            <h2 className="hm-h2">It&apos;s an app without the App Store.</h2>
            <p className="hm-sub">
              Woodpecker installs straight from the browser. Full-screen, offline-ready, Pencil and
              palm rejection built in. On a laptop it works with a mouse or trackpad too.
            </p>
          </div>
          <InstallCard />
        </section>

        <section className="hm-section hm-trust">
          <div className="hm-trust-item">
            <Lock size={18} />
            <div>
              <strong>Encrypted end to end on the way.</strong> Your notebook and your agent share a key
              made on your device. The relay that connects them only ever sees ciphertext.
            </div>
          </div>
          <div className="hm-trust-item">
            <Cloud size={18} />
            <div>
              <strong>A private agent, not a shared one.</strong> Everyone gets their own isolated
              container with its own storage. Your Claude token and what it has learned live there, and
              you can disconnect any time.
            </div>
          </div>
          <div className="hm-trust-item">
            <Mic size={18} />
            <div>
              <strong>Voice stays on your device.</strong> Dictation uses your browser&apos;s own speech
              recognition. Woodpecker only ever sees the words.
            </div>
          </div>
        </section>
      </main>

      <footer className="hm-footer">
        <p className="hm-quote hm-hand">&ldquo;describe the tongue of a woodpecker&rdquo;</p>
        <p className="hm-attr">Leonardo da Vinci, notebook entry, c. 1508</p>
        <p className="hm-story">
          The most curious mind alive left himself a note about one of life&apos;s smallest mysteries.
          Room to wonder, and the tools to chase it down. That&apos;s the whole product.
        </p>
        <div className="hm-footer-bar">
          <span>Woodpecker</span>
          <a href="https://github.com/brianfoody/woodpecker-os" target="_blank" rel="noreferrer">
            GitHub
          </a>
          <a href="/canvas">Classic canvas</a>
        </div>
      </footer>
    </div>
  );
}
