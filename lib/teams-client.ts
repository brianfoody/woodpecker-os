import { getValidMicrosoftToken } from "./token-storage";
import type { TeamsMessage } from "./email-models";

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

export async function getRecentChats(): Promise<
  Array<{ id: string; topic: string }>
> {
  const data = await graphFetch(
    "/me/chats?$top=10&$orderby=lastUpdatedDateTime desc&$select=id,topic"
  );
  return (data.value || []).map(
    (chat: { id: string; topic: string | null }) => ({
      id: chat.id,
      topic: chat.topic || "Unnamed chat",
    })
  );
}

export async function getChatMessages(
  chatId: string,
  count = 5
): Promise<TeamsMessage[]> {
  const data = await graphFetch(
    `/me/chats/${chatId}/messages?$top=${count}&$orderby=createdDateTime desc`
  );

  return (data.value || [])
    .filter(
      (msg: { messageType: string }) => msg.messageType === "message"
    )
    .map(
      (msg: {
        id: string;
        chatId: string;
        from: {
          user: { displayName: string; id: string } | null;
        } | null;
        body: { content: string };
        createdDateTime: string;
      }) => ({
        id: msg.id,
        chatId,
        chatName: "",
        from: {
          name: msg.from?.user?.displayName || "Unknown",
          email: msg.from?.user?.id || "",
        },
        content: msg.body?.content?.replace(/<[^>]*>/g, "").trim() || "",
        sentAt: msg.createdDateTime,
      })
    );
}

export async function getRecentMessages(count = 5): Promise<TeamsMessage[]> {
  const chats = await getRecentChats();
  const allMessages: TeamsMessage[] = [];

  for (const chat of chats.slice(0, 5)) {
    const messages = await getChatMessages(chat.id, count);
    messages.forEach((m) => (m.chatName = chat.topic));
    allMessages.push(...messages);
  }

  allMessages.sort(
    (a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime()
  );

  return allMessages;
}

export async function replyToChat(
  chatId: string,
  text: string
): Promise<{ success: boolean }> {
  await graphFetch(`/me/chats/${chatId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      body: {
        content: text,
      },
    }),
  });

  return { success: true };
}
