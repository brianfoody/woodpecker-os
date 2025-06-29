import './globals.css';
import type { Metadata } from 'next';
import { GeistSans, GeistMono } from 'geist/font';
import { ThemeProvider } from 'next-themes';

export const metadata: Metadata = {
  title: 'AI Canvas - Intelligent Drawing Interface',
  description: 'An advanced e-ink display interface with AI-powered gesture recognition and real-world actions.',
  keywords: ['AI', 'Canvas', 'Drawing', 'Gesture Recognition', 'tldraw'],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${GeistSans.variable} ${GeistMono.variable} font-sans antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}