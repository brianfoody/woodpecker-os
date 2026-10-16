import type { Metadata, Viewport } from "next";
import NotebookClient from "./notebook-client";

export const metadata: Metadata = {
  title: "Notebook",
  description: "A notebook that reads along — write or speak, and your agent quietly gets things ready.",
  robots: { index: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f3ea" },
    { media: "(prefers-color-scheme: dark)", color: "#17161a" },
  ],
};

export default function NotebookPage() {
  return <NotebookClient />;
}
