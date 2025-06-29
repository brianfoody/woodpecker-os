import { MessageStatus } from "twilio/lib/rest/api/v2010/account/message";

export type SmartContact = {
  name: string;
  phoneNumber: string;
};

export type SmartMessage = SmartContact & {
  text: string;
  sentAt?: Date;
  status?: MessageStatus;
};

export type SmartAction =
  | "ask_ai"
  | "search"
  | "send_message"
  | "add_contact"
  | "read_contact_messages";

export type SmartTask = {
  action: SmartAction;
  text: string;
  confidence_score: number;
};

export interface AIAction {
  id: string;
  action: SmartAction;
  text: string;
  confidence_score: number;
  type: "create" | "modify" | "delete" | "suggestion";
  icon?: React.ReactNode;
}
