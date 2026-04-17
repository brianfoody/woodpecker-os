export function claudeCodeFetch(prompt: string, opts?: { resumeSessionId?: string; image?: string }) {
  return fetch("/api/claude-code", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Woodpecker-Token": process.env.NEXT_PUBLIC_WOODPECKER_AUTH_TOKEN!,
    },
    body: JSON.stringify({ prompt, resumeSessionId: opts?.resumeSessionId, image: opts?.image }),
  });
}

export async function extractTextFromImage(base64: string): Promise<string> {
  const res = await fetch("/api/extract-text", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Woodpecker-Token": process.env.NEXT_PUBLIC_WOODPECKER_AUTH_TOKEN!,
    },
    body: JSON.stringify({ image: base64 }),
  });
  if (!res.ok) throw new Error(`OCR request failed: ${res.status}`);
  const data = await res.json();
  return data.text || "";
}

export function fetchSessionTranscript(sessionId: string): Promise<{ textBlocks: string[]; isComplete: boolean } | null> {
  return fetch(`/api/sessions/${sessionId}/transcript`, {
    headers: { "X-Woodpecker-Token": process.env.NEXT_PUBLIC_WOODPECKER_AUTH_TOKEN! },
  }).then(r => r.ok ? r.json() : null);
}
