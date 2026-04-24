export default function V2Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`body { background-color: #0a0a14 !important; }`}</style>
      {children}
    </>
  );
}
