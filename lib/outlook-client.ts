import { getValidMicrosoftToken } from "./token-storage";
import type { EmailData } from "./email-models";

const GRAPH_API = "https://graph.microsoft.com/v1.0";

async function graphFetch(path: string, options: RequestInit = {}) {
  const token = await getValidMicrosoftToken();
  const res = await fetch(`${GRAPH_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`Graph API error: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function getRecentEmails(
  count = 10,
  since?: string
): Promise<EmailData[]> {
  let filter = "";
  if (since) {
    filter = `&$filter=receivedDateTime ge ${since}`;
  }

  const data = await graphFetch(
    `/me/messages?$top=${count}&$orderby=receivedDateTime desc&$select=id,conversationId,from,subject,bodyPreview,receivedDateTime,isRead${filter}`
  );

  return (data.value || []).map(
    (msg: {
      id: string;
      conversationId: string;
      from: { emailAddress: { name: string; address: string } };
      subject: string;
      bodyPreview: string;
      receivedDateTime: string;
      isRead: boolean;
    }) => ({
      id: msg.id,
      threadId: msg.conversationId,
      provider: "outlook" as const,
      from: {
        name: msg.from?.emailAddress?.name || "",
        email: msg.from?.emailAddress?.address || "",
      },
      subject: msg.subject || "",
      snippet: msg.bodyPreview || "",
      receivedAt: msg.receivedDateTime,
      isRead: msg.isRead,
    })
  );
}

export async function replyToEmail(
  messageId: string,
  replyText: string
): Promise<{ success: boolean }> {
  await graphFetch(`/me/messages/${messageId}/reply`, {
    method: "POST",
    body: JSON.stringify({
      comment: replyText,
    }),
  });

  return { success: true };
}
