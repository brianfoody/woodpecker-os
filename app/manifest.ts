import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/notebook",
    name: "Woodpecker",
    short_name: "Woodpecker",
    description:
      "A notebook that reads along. Write or speak; your own cloud agent quietly gets things ready, and nothing happens until you tick.",
    start_url: "/notebook",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f7f3ea",
    theme_color: "#f7f3ea",
    categories: ["productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
