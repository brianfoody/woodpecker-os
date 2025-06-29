import { SmartContact } from "./models";

const CONTACTS_STORAGE_KEY = "woodpecker-contacts";

/**
 * Save a contact to localStorage
 */
export const saveContact = (contact: SmartContact): void => {
  try {
    const existingContacts = loadContacts();
    
    // Check if contact already exists (by phone number)
    const existingIndex = existingContacts.findIndex(
      (c) => c.phoneNumber === contact.phoneNumber
    );
    
    if (existingIndex >= 0) {
      // Update existing contact
      existingContacts[existingIndex] = contact;
      console.log("📱 Updated existing contact:", contact.name);
    } else {
      // Add new contact
      existingContacts.push(contact);
      console.log("📱 Added new contact:", contact.name);
    }
    
    localStorage.setItem(CONTACTS_STORAGE_KEY, JSON.stringify(existingContacts));
  } catch (error) {
    console.error("❌ Failed to save contact to localStorage:", error);
    throw new Error("Failed to save contact");
  }
};

/**
 * Load all contacts from localStorage
 */
export const loadContacts = (): SmartContact[] => {
  try {
    const stored = localStorage.getItem(CONTACTS_STORAGE_KEY);
    if (!stored) {
      return [];
    }
    
    const contacts = JSON.parse(stored) as SmartContact[];
    console.log(`📱 Loaded ${contacts.length} contacts from localStorage`);
    return contacts;
  } catch (error) {
    console.error("❌ Failed to load contacts from localStorage:", error);
    return [];
  }
};

/**
 * Get all contacts (alias for loadContacts for consistency)
 */
export const getAllContacts = (): SmartContact[] => {
  return loadContacts();
};

/**
 * Delete a contact by phone number
 */
export const deleteContact = (phoneNumber: string): boolean => {
  try {
    const existingContacts = loadContacts();
    const filteredContacts = existingContacts.filter(
      (c) => c.phoneNumber !== phoneNumber
    );
    
    if (filteredContacts.length === existingContacts.length) {
      console.log("📱 Contact not found for deletion:", phoneNumber);
      return false;
    }
    
    localStorage.setItem(CONTACTS_STORAGE_KEY, JSON.stringify(filteredContacts));
    console.log("📱 Deleted contact:", phoneNumber);
    return true;
  } catch (error) {
    console.error("❌ Failed to delete contact:", error);
    return false;
  }
};

/**
 * Clear all contacts from localStorage
 */
export const clearAllContacts = (): void => {
  try {
    localStorage.removeItem(CONTACTS_STORAGE_KEY);
    console.log("📱 Cleared all contacts from localStorage");
  } catch (error) {
    console.error("❌ Failed to clear contacts:", error);
  }
};