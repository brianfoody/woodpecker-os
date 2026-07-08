"use client";

import { useEffect, useState } from "react";
import { Github, Star } from "lucide-react";

const REPO = "brianfoody/woodpecker-os";
const CACHE_KEY = "wp-gh-stars";

function formatStars(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : `${n}`;
}

/**
 * "Star on GitHub" nav button with a live star count. The count is
 * fetched client-side from the public GitHub API and cached per session;
 * if the fetch fails the button still renders without a count.
 */
export function GitHubStarButton() {
  const [stars, setStars] = useState<number | null>(null);

  useEffect(() => {
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) {
        setStars(Number(cached));
        return;
      }
    } catch {}
    fetch(`https://api.github.com/repos/${REPO}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (typeof d?.stargazers_count === "number") {
          setStars(d.stargazers_count);
          try {
            sessionStorage.setItem(CACHE_KEY, String(d.stargazers_count));
          } catch {}
        }
      })
      .catch(() => {});
  }, []);

  return (
    <a
      href={`https://github.com/${REPO}`}
      className="lp-nav-gh"
      target="_blank"
      rel="noreferrer"
      aria-label="Star Woodpecker OS on GitHub"
    >
      <Github size={15} strokeWidth={1.8} />
      <span className="lp-nav-gh-label">Star on GitHub</span>
      {stars !== null && (
        <span className="lp-nav-gh-count">
          <Star size={11} strokeWidth={2} fill="currentColor" />
          {formatStars(stars)}
        </span>
      )}
    </a>
  );
}
