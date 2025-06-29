const MESSAGE_OFFSET_KEY = "woodpecker-last-message-check";

/**
 * Get the last message retrieval timestamp from localStorage
 */
export const getLastMessageCheck = (): Date | null => {
  try {
    const stored = localStorage.getItem(MESSAGE_OFFSET_KEY);
    if (!stored) {
      return null;
    }
    
    const timestamp = new Date(stored);
    if (isNaN(timestamp.getTime())) {
      console.warn("❌ Invalid stored message timestamp, clearing it");
      localStorage.removeItem(MESSAGE_OFFSET_KEY);
      return null;
    }
    
    console.log("📱 Last message check retrieved:", timestamp.toISOString());
    return timestamp;
  } catch (error) {
    console.error("❌ Failed to get last message check from localStorage:", error);
    return null;
  }
};

/**
 * Update the last message retrieval timestamp in localStorage
 */
export const updateLastMessageCheck = (timestamp: Date): void => {
  try {
    const previousCheck = getLastMessageCheck();
    localStorage.setItem(MESSAGE_OFFSET_KEY, timestamp.toISOString());
    console.log("📱 Last message check updated:", {
      previous: previousCheck?.toISOString() || "never",
      new: timestamp.toISOString(),
      timeDiff: previousCheck ? (timestamp.getTime() - previousCheck.getTime()) / 1000 : "N/A"
    });
  } catch (error) {
    console.error("❌ Failed to update last message check in localStorage:", error);
  }
};

/**
 * Clear the message tracking data (useful for testing or reset)
 */
export const clearMessageTracking = (): void => {
  try {
    localStorage.removeItem(MESSAGE_OFFSET_KEY);
    console.log("📱 Message tracking data cleared");
  } catch (error) {
    console.error("❌ Failed to clear message tracking:", error);
  }
};