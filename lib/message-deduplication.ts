const SENT_MESSAGES_KEY = "woodpecker-sent-messages";

export interface SentMessage {
  phoneNumber: string;
  text: string;
  sentAt: string;
  messageHash: string;
}

/**
 * Create a hash for message deduplication
 */
function createMessageHash(phoneNumber: string, text: string): string {
  // Simple hash combining phone number and message text
  return btoa(`${phoneNumber}:${text.trim()}`);
}

/**
 * Check if a message has already been sent
 */
export const isMessageAlreadySent = (phoneNumber: string, text: string): boolean => {
  try {
    const stored = localStorage.getItem(SENT_MESSAGES_KEY);
    if (!stored) return false;

    const sentMessages: SentMessage[] = JSON.parse(stored);
    const messageHash = createMessageHash(phoneNumber, text);
    
    const alreadySent = sentMessages.some(msg => msg.messageHash === messageHash);
    
    if (alreadySent) {
      console.log("🚫 Message already sent, preventing duplicate:", { phoneNumber, text: text.substring(0, 50) + "..." });
    }
    
    return alreadySent;
  } catch (error) {
    console.error("❌ Failed to check message deduplication:", error);
    return false; // Allow sending if check fails
  }
};

/**
 * Mark a message as sent
 */
export const markMessageAsSent = (phoneNumber: string, text: string): void => {
  try {
    const stored = localStorage.getItem(SENT_MESSAGES_KEY);
    const sentMessages: SentMessage[] = stored ? JSON.parse(stored) : [];
    
    const messageHash = createMessageHash(phoneNumber, text);
    const sentMessage: SentMessage = {
      phoneNumber,
      text,
      sentAt: new Date().toISOString(),
      messageHash,
    };
    
    // Add to the list
    sentMessages.push(sentMessage);
    
    // Keep only the last 100 messages to prevent localStorage bloat
    const recentMessages = sentMessages.slice(-100);
    
    localStorage.setItem(SENT_MESSAGES_KEY, JSON.stringify(recentMessages));
    console.log("✅ Message marked as sent:", { phoneNumber, text: text.substring(0, 50) + "..." });
  } catch (error) {
    console.error("❌ Failed to mark message as sent:", error);
  }
};

/**
 * Clear sent messages history (useful for testing or reset)
 */
export const clearSentMessages = (): void => {
  try {
    localStorage.removeItem(SENT_MESSAGES_KEY);
    console.log("🗑️ Sent messages history cleared");
  } catch (error) {
    console.error("❌ Failed to clear sent messages:", error);
  }
};

/**
 * Get all sent messages (for debugging)
 */
export const getSentMessages = (): SentMessage[] => {
  try {
    const stored = localStorage.getItem(SENT_MESSAGES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error("❌ Failed to get sent messages:", error);
    return [];
  }
};