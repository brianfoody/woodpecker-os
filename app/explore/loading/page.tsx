"use client";

import dynamic from "next/dynamic";

const LoadingIndicatorsShowcase = dynamic(
  () => import("@/components/explore/loading-indicators-showcase"),
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
        Loading indicators...
      </div>
    ),
  }
);

export default function LoadingIndicatorsPage() {
  return <LoadingIndicatorsShowcase />;
}
