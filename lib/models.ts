// Legacy SMS message status (previously twilio's MessageStatus type)
type MessageStatus =
  | "queued"
  | "sending"
  | "sent"
  | "failed"
  | "delivered"
  | "undelivered"
  | "receiving"
  | "received"
  | "accepted"
  | "scheduled"
  | "read"
  | "partially_delivered"
  | "canceled";

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
