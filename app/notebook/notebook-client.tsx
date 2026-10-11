"use client";

import dynamic from "next/dynamic";
import "@/components/notebook/notebook.css";

const Notebook = dynamic(() => import("@/components/notebook/notebook"), {
  ssr: false,
  loading: () => <div className="nb" />,
});

export default function NotebookClient() {
  return <Notebook />;
}
