"use client";

import dynamic from "next/dynamic";

const NeonGridLoadingShowcase = dynamic(
  () => import("@/components/explore/neon-grid-loading-showcase"),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          fontFamily: "'Share Tech Mono', monospace",
          color: "#00ffaa",
          background: "#0a0a14",
        }}
      >
        Loading indicators...
      </div>
    ),
  }
);

export default function NeonGridLoadingPage() {
  return <NeonGridLoadingShowcase />;
}
