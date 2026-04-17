"use client";

import dynamic from "next/dynamic";

const ExploreCanvas = dynamic(
  () => import("@/components/explore/explore-canvas"),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          fontFamily: "-apple-system, sans-serif",
          color: "#888",
        }}
      >
        Loading design explorer...
      </div>
    ),
  }
);

export default function ExplorePage() {
  return <ExploreCanvas />;
}
