import dynamic from 'next/dynamic';

// Dynamically import the client-only tldraw component with SSR disabled
const ClientTldraw = dynamic(() => import('@/components/client-tldraw'), {
  ssr: false,
  loading: () => (
    <div className="h-screen w-full flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
        <p className="text-sm text-muted-foreground">Loading AI Canvas...</p>
      </div>
    </div>
  ),
});

export default function CanvasPage() {
  return <ClientTldraw />;
}