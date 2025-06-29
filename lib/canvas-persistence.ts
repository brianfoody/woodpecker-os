'use client';

import { Editor, TLRecord, createTLStore, defaultShapeUtils } from 'tldraw';
import { AIBubbleShapeUtil } from './shapes/ai-bubble-shape';
import { MessageBubbleShapeUtil } from './shapes/message-bubble-shape';

const STORAGE_KEY = 'ai-canvas-data';
const STORAGE_VERSION = '1.0';

interface CanvasData {
  version: string;
  timestamp: number;
  records: TLRecord[];
  metadata: {
    totalShapes: number;
    aiInteractions: number;
    messagesCount: number;
    lastActivity: number;
  };
}

// Custom shape utils for persistence
const customShapeUtils = [
  ...defaultShapeUtils,
  AIBubbleShapeUtil,
  MessageBubbleShapeUtil,
];

// Save canvas data to localStorage with metadata
export function saveCanvasData(editor: Editor): boolean {
  try {
    const records = editor.store.allRecords();
    const shapes = editor.getCurrentPageShapes();
    
    const aiShapes = shapes.filter(shape => shape.type === 'ai-bubble');
    const messageShapes = shapes.filter(shape => shape.type === 'message-bubble');
    
    const canvasData: CanvasData = {
      version: STORAGE_VERSION,
      timestamp: Date.now(),
      records,
      metadata: {
        totalShapes: shapes.length,
        aiInteractions: aiShapes.length,
        messagesCount: messageShapes.length,
        lastActivity: Date.now(),
      },
    };
    
    const serializedData = JSON.stringify(canvasData);
    localStorage.setItem(STORAGE_KEY, serializedData);
    
    // Also save a backup with timestamp
    const backupKey = `${STORAGE_KEY}-backup-${Date.now()}`;
    localStorage.setItem(backupKey, serializedData);
    
    // Clean up old backups (keep only 5 most recent)
    cleanupOldBackups();
    
    console.log('Canvas data saved successfully');
    return true;
    
  } catch (error) {
    console.error('Failed to save canvas data:', error);
    return false;
  }
}

// Load canvas data from localStorage
export function loadCanvasData(editor: Editor): boolean {
  try {
    const savedData = localStorage.getItem(STORAGE_KEY);
    
    if (!savedData) {
      console.log('No saved canvas data found');
      return false;
    }
    
    const canvasData: CanvasData = JSON.parse(savedData);
    
    // Validate version compatibility
    if (canvasData.version !== STORAGE_VERSION) {
      console.warn('Canvas data version mismatch, attempting migration...');
      // In the future, implement data migration logic here
    }
    
    // Validate data structure
    if (!canvasData.records || !Array.isArray(canvasData.records)) {
      throw new Error('Invalid canvas data structure');
    }
    
    // Clear current canvas and load saved data
    editor.store.clear();
    
    // Load records into the store
    editor.store.put(canvasData.records);
    
    // Focus on the loaded content
    editor.zoomToFit();
    
    console.log('Canvas data loaded successfully', canvasData.metadata);
    return true;
    
  } catch (error) {
    console.error('Failed to load canvas data:', error);
    return false;
  }
}

// Export canvas data to file
export function exportCanvasData(editor: Editor): string | null {
  try {
    const records = editor.store.allRecords();
    const shapes = editor.getCurrentPageShapes();
    
    const exportData = {
      version: STORAGE_VERSION,
      exportTimestamp: Date.now(),
      records,
      metadata: {
        totalShapes: shapes.length,
        exportDate: new Date().toISOString(),
      },
    };
    
    return JSON.stringify(exportData, null, 2);
    
  } catch (error) {
    console.error('Failed to export canvas data:', error);
    return null;
  }
}

// Import canvas data from file
export function importCanvasData(editor: Editor, jsonData: string): boolean {
  try {
    const importData = JSON.parse(jsonData);
    
    // Validate imported data
    if (!importData.records || !Array.isArray(importData.records)) {
      throw new Error('Invalid import data structure');
    }
    
    // Clear current canvas
    editor.store.clear();
    
    // Load imported records
    editor.store.put(importData.records);
    
    // Focus on imported content
    editor.zoomToFit();
    
    console.log('Canvas data imported successfully');
    return true;
    
  } catch (error) {
    console.error('Failed to import canvas data:', error);
    return false;
  }
}

// Get saved canvas metadata without loading
export function getCanvasMetadata(): CanvasData['metadata'] | null {
  try {
    const savedData = localStorage.getItem(STORAGE_KEY);
    
    if (!savedData) {
      return null;
    }
    
    const canvasData: CanvasData = JSON.parse(savedData);
    return canvasData.metadata;
    
  } catch (error) {
    console.error('Failed to get canvas metadata:', error);
    return null;
  }
}

// Clear all saved canvas data
export function clearCanvasData(): boolean {
  try {
    localStorage.removeItem(STORAGE_KEY);
    
    // Also clear backups
    const keys = Object.keys(localStorage);
    const backupKeys = keys.filter(key => key.startsWith(`${STORAGE_KEY}-backup-`));
    
    backupKeys.forEach(key => localStorage.removeItem(key));
    
    console.log('Canvas data cleared successfully');
    return true;
    
  } catch (error) {
    console.error('Failed to clear canvas data:', error);
    return false;
  }
}

// Clean up old backup files
function cleanupOldBackups(): void {
  try {
    const keys = Object.keys(localStorage);
    const backupKeys = keys.filter(key => key.startsWith(`${STORAGE_KEY}-backup-`));
    
    // Sort by timestamp (newest first)
    backupKeys.sort((a, b) => {
      const timestampA = parseInt(a.split('-').pop() || '0');
      const timestampB = parseInt(b.split('-').pop() || '0');
      return timestampB - timestampA;
    });
    
    // Remove old backups (keep only 5 most recent)
    if (backupKeys.length > 5) {
      const oldBackups = backupKeys.slice(5);
      oldBackups.forEach(key => localStorage.removeItem(key));
    }
    
  } catch (error) {
    console.error('Failed to cleanup old backups:', error);
  }
}

// Auto-save functionality with debouncing
let autoSaveTimeout: NodeJS.Timeout | null = null;

export function scheduleAutoSave(editor: Editor, delay: number = 2000): void {
  if (autoSaveTimeout) {
    clearTimeout(autoSaveTimeout);
  }
  
  autoSaveTimeout = setTimeout(() => {
    saveCanvasData(editor);
  }, delay);
}

// Cancel pending auto-save
export function cancelAutoSave(): void {
  if (autoSaveTimeout) {
    clearTimeout(autoSaveTimeout);
    autoSaveTimeout = null;
  }
}