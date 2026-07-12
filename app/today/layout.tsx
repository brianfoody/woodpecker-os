export default function TodayLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`
        html, body { background-color: #0a0a14 !important; color-scheme: dark; }
        .tl-container {
          --tl-font-draw: 'Orbitron', sans-serif;
          --tl-font-sans: 'Orbitron', sans-serif;
          --tl-font-serif: 'Orbitron', sans-serif;
          --tl-font-mono: 'Share Tech Mono', monospace;
        }
      `}</style>
      {children}
    </>
  );
}
