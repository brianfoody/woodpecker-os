export type EmailProvider = "gmail" | "outlook";
export type EmailImportance = "low" | "medium" | "high";

export interface EmailData {
  id: string;
  threadId: string;
  provider: EmailProvider;
  from: { name: string; email: string };
  subject: string;
  snippet: string;
  receivedAt: string;
  isRead: boolean;
}

export interface EmailSummary {
  totalCount: number;
  importantCount: number;
  summary: string;
  emails: Array<EmailData & { importance: EmailImportance; reason: string }>;
}

export interface TeamsMessage {
  id: string;
  chatId: string;
  chatName: string;
  from: { name: string; email: string };
  content: string;
  sentAt: string;
}

export interface TeamsSummary {
  totalChats: number;
  importantCount: number;
  summary: string;
  messages: Array<
    TeamsMessage & { importance: EmailImportance; reason: string }
  >;
}
