import { getValidGoogleToken } from "./token-storage";
import type { EmailData } from "./email-models";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

async function gmailFetch(path: string, options: RequestInit = {}) {
  const token = await getValidGoogleToken();
  const res = await fetch(`${GMAIL_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`Gmail API error: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

function getHeader(
  headers: Array<{ name: string; value: string }>,
  name: string
): string {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";
}

export async function getRecentEmails(
  count = 10,
  since?: string
): Promise<EmailData[]> {
  let query = "in:inbox";
  if (since) {
    query += ` after:${since}`;
  }

  const listRes = await gmailFetch(
    `/messages?maxResults=${count}&q=${encodeURIComponent(query)}`
  );

  if (!listRes.messages || listRes.messages.length === 0) {
    return [];
  }

  const emails: EmailData[] = [];
  for (const msg of listRes.messages) {
    const detail = await gmailFetch(`/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`);
    const headers = detail.payload?.headers || [];
    const fromRaw = getHeader(headers, "From");
    const fromMatch = fromRaw.match(/^(.+?)\s*<(.+?)>$/);

    emails.push({
      id: detail.id,
      threadId: detail.threadId,
      provider: "gmail",
      from: {
        name: fromMatch ? fromMatch[1].replace(/"/g, "").trim() : fromRaw,
        email: fromMatch ? fromMatch[2] : fromRaw,
      },
      subject: getHeader(headers, "Subject"),
      snippet: detail.snippet || "",
      receivedAt: new Date(parseInt(detail.internalDate)).toISOString(),
      isRead: !detail.labelIds?.includes("UNREAD"),
    });
  }

  return emails;
}

export async function replyToEmail(
  threadId: string,
  messageId: string,
  replyText: string
): Promise<{ success: boolean }> {
  // Get the original message to build proper reply headers
  const original = await gmailFetch(
    `/messages/${messageId}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Message-Id`
  );
  const headers = original.payload?.headers || [];
  const originalFrom = getHeader(headers, "From");
  const originalSubject = getHeader(headers, "Subject");
  const originalMessageId = getHeader(headers, "Message-Id");

  const subject = originalSubject.startsWith("Re:")
    ? originalSubject
    : `Re: ${originalSubject}`;

  // Build RFC 2822 email
  const email = [
    `To: ${originalFrom}`,
    `Subject: ${subject}`,
    `In-Reply-To: ${originalMessageId}`,
    `References: ${originalMessageId}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    replyText,
  ].join("\r\n");

  const encoded = Buffer.from(email)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  await gmailFetch(`/messages/send`, {
    method: "POST",
    body: JSON.stringify({
      raw: encoded,
      threadId,
    }),
  });

  return { success: true };
}
