import { MessageStatus } from "twilio/lib/rest/api/v2010/account/message";

export type SmartContact = {
  name: string;
  phoneNumber: string;
};

export type SmartMessage = SmartContact & {
  text: string;
  priority?: "normal" | "important" | "urgent";
  sentAt?: Date;
  status?: MessageStatus;
  direction?: "inbound" | "outbound";
};

export interface WebsiteCreationJob {
  jobId: string;
  status: "creating" | "deploying" | "complete" | "failed";
  progress?: number;
  netlifyUrl?: string;
  boltUrl?: string;
  errorMessage?: string;
  createdAt: Date;
}
