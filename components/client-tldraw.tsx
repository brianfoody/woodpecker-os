'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Tldraw, Editor } from 'tldraw';
import { AIBubbleShapeUtil } from '@/lib/shapes/ai-bubble-shape';
import { MessageBubbleShapeUtil } from '@/lib/shapes/message-bubble-shape';
import { detectCircleGesture } from '@/lib/gesture-detection';
import { saveCanvasData, loadCanvasData } from '@/lib/canvas-persistence';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Wand2, MessageSquare, UserPlus, Palette, Settings, Moon, Sun, Save, Loader2, Trash2 } from 'lucide-react';
import { useTheme } from 'next-themes';

// Custom shape utils for AI and message bubbles
const customShapeUtils = [AIBubbleShapeUtil, MessageBubbleShapeUtil];

interface GestureState {
  isDetecting: boolean;
  circleComplete: boolean;
  actionType: 'ask_ai' | 'send_message' | 'add_contact' | null;
}

interface CanvasStats {
  shapesCount: number;
  aiInteractions: number;
  messagesCount: number;
  contactsCount: number;
}

export default function ClientTldraw() {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [gestureState, setGestureState] = useState<GestureState>({
    isDetecting: false,
    circleComplete: false,
    actionType: null,
  });
  const [canvasStats, setCanvasStats] = useState<CanvasStats>({
    shapesCount: 0,
    aiInteractions: 0,
    messagesCount: 0,
    contactsCount: 0,
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  
  const { theme, setTheme } = useTheme();
  const gestureTimeoutRef = useRef<NodeJS.Timeout>();
  const saveTimeoutRef = useRef<NodeJS.Timeout>();

  // Check if editor is ready for operations
  const checkEditorReady = useCallback((editor: Editor): boolean => {
    try {
      if (!editor) return false;
      
      // Check if editor has a valid store and document
      const store = editor.store;
      if (!store) return false;
      
      // Check if we can access the instance state
      const instanceState = editor.getInstanceState();
      if (!instanceState) return false;
      
      // Check if current page ID is available
      const currentPageId = instanceState.currentPageId;
      if (!currentPageId) return false;
      
      // Check if we can get the document record
      const documentRecord = store.get('document:document' as any);
      if (!documentRecord) return false;
      
      return true;
    } catch (error) {
      console.warn('Editor readiness check failed:', error);
      return false;
    }
  }, []);

  // Auto-save functionality with debouncing
  const debouncedSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    saveTimeoutRef.current = setTimeout(() => {
      if (editor && checkEditorReady(editor)) {
        saveCanvasData(editor);
        setLastSaved(new Date());
      }
    }, 2000); // Save 2 seconds after last change
  }, [editor, checkEditorReady]);

  // Update canvas statistics
  const updateCanvasStats = useCallback(() => {
    if (!editor || !checkEditorReady(editor)) return;
    
    try {
      const shapes = editor.getCurrentPageShapes();
      const aiShapes = shapes.filter(shape => shape.type === 'ai-bubble');
      const messageShapes = shapes.filter(shape => shape.type === 'message-bubble');
      
      setCanvasStats({
        shapesCount: shapes.length,
        aiInteractions: aiShapes.length,
        messagesCount: messageShapes.length,
        contactsCount: 0, // This would be tracked in contacts API
      });
    } catch (error) {
      console.warn('Failed to update canvas stats:', error);
    }
  }, [editor, checkEditorReady]);

  // Handle circle gesture detection
  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!editor || !checkEditorReady(editor) || gestureState.isDetecting) return;

    try {
      const point = editor.screenToPage({ x: e.clientX, y: e.clientY });
      const circleDetected = detectCircleGesture(point, editor);
      
      if (circleDetected && !gestureState.circleComplete) {
        setGestureState(prev => ({
          ...prev,
          isDetecting: true,
          circleComplete: true,
        }));
        
        // Clear any existing timeout
        if (gestureTimeoutRef.current) {
          clearTimeout(gestureTimeoutRef.current);
        }
        
        // Reset gesture state after delay
        gestureTimeoutRef.current = setTimeout(() => {
          setGestureState({
            isDetecting: false,
            circleComplete: false,
            actionType: null,
          });
        }, 3000);
        
        // Show action selection UI
        handleGestureComplete(point);
      }
    } catch (error) {
      console.warn('Gesture detection failed:', error);
    }
  }, [editor, gestureState, checkEditorReady]);

  // Process completed gesture
  const handleGestureComplete = useCallback(async (point: { x: number; y: number }) => {
    if (!editor || !checkEditorReady(editor)) return;

    try {
      // Get content within the circle for AI processing
      const selectedShapes = editor.getSelectedShapes();
      const content = selectedShapes.length > 0 
        ? selectedShapes.map(shape => (shape as any).props?.text || '').join(' ')
        : 'General AI assistance request';

      setIsProcessing(true);
      
      // Make API request to process AI request
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content,
          actionType: 'ask_ai',
        }),
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const aiResponse = await response.json();
      
      // Create AI bubble shape on canvas
      editor.createShape({
        id: editor.createShapeId(),
        type: 'ai-bubble',
        x: point.x + 50,
        y: point.y - 100,
        props: {
          text: aiResponse.content,
          timestamp: Date.now(),
          actionType: 'ask_ai',
        },
      });
      
      updateCanvasStats();
      debouncedSave();
      
    } catch (error) {
      console.error('AI processing failed:', error);
      
      if (editor && checkEditorReady(editor)) {
        // Create error bubble
        editor.createShape({
          id: editor.createShapeId(),
          type: 'ai-bubble',
          x: point.x + 50,
          y: point.y - 100,
          props: {
            text: 'Sorry, I encountered an error processing your request.',
            timestamp: Date.now(),
            actionType: 'ask_ai',
            isError: true,
          },
        });
      }
    } finally {
      setIsProcessing(false);
    }
  }, [editor, updateCanvasStats, debouncedSave, checkEditorReady]);

  // Handle manual save
  const handleManualSave = useCallback(() => {
    if (editor && checkEditorReady(editor)) {
      saveCanvasData(editor);
      setLastSaved(new Date());
    }
  }, [editor, checkEditorReady]);

  // Handle canvas load
  const handleLoadCanvas = useCallback(() => {
    if (editor && checkEditorReady(editor)) {
      loadCanvasData(editor);
      updateCanvasStats();
    }
  }, [editor, updateCanvasStats, checkEditorReady]);

  // Handle canvas clear
  const handleClearCanvas = useCallback(() => {
    if (editor && checkEditorReady(editor)) {
      try {
        const shapes = editor.getCurrentPageShapes();
        editor.deleteShapes(shapes.map(shape => shape.id));
        updateCanvasStats();
        debouncedSave();
      } catch (error) {
        console.warn('Failed to clear canvas:', error);
      }
    }
  }, [editor, updateCanvasStats, debouncedSave, checkEditorReady]);

  // Initialize editor and load saved data
  useEffect(() => {
    if (editor) {
      // Wait for editor to be fully ready before operations
      const initializeEditor = () => {
        if (checkEditorReady(editor)) {
          // Load saved canvas data
          loadCanvasData(editor);
          updateCanvasStats();
          
          // Set up auto-save on changes
          const unsub = editor.store.listen(() => {
            debouncedSave();
            updateCanvasStats();
          });
          
          return unsub;
        } else {
          // Retry after a short delay
          setTimeout(initializeEditor, 100);
        }
      };

      const cleanup = initializeEditor();
      return cleanup;
    }
  }, [editor, debouncedSave, updateCanvasStats, checkEditorReady]);

  // Cleanup timeouts
  useEffect(() => {
    return () => {
      if (gestureTimeoutRef.current) {
        clearTimeout(gestureTimeoutRef.current);
      }
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="h-screen w-full relative bg-background">
      {/* Top Toolbar */}
      <div className="absolute top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-semibold">AI Canvas</h1>
            </div>
            
            {gestureState.isDetecting && (
              <Badge variant="secondary" className="animate-pulse">
                <Wand2 className="h-3 w-3 mr-1" />
                Gesture Detected
              </Badge>
            )}
            
            {isProcessing && (
              <Badge variant="outline" className="animate-pulse">
                Processing AI Request...
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleManualSave}
              disabled={!editor}
            >
              <Save className="h-4 w-4 mr-1" />
              Save
            </Button>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLoadCanvas}
              disabled={!editor}
            >
              <Loader2 className="h-4 w-4 mr-1" />
              Load
            </Button>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearCanvas}
              disabled={!editor}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Clear
            </Button>
            
            <Separator orientation="vertical" className="h-6" />
            
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Side Stats Panel */}
      <div className="absolute top-20 right-4 z-40 w-64">
        <Card className="bg-background/95 backdrop-blur-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Canvas Stats</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Shapes</span>
              <Badge variant="secondary">{canvasStats.shapesCount}</Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <Wand2 className="h-3 w-3" />
                AI Interactions
              </span>
              <Badge variant="secondary">{canvasStats.aiInteractions}</Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <MessageSquare className="h-3 w-3" />
                Messages
              </span>
              <Badge variant="secondary">{canvasStats.messagesCount}</Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <UserPlus className="h-3 w-3" />
                Contacts
              </span>
              <Badge variant="secondary">{canvasStats.contactsCount}</Badge>
            </div>
            
            {lastSaved && (
              <>
                <Separator />
                <div className="text-xs text-muted-foreground">
                  Last saved: {lastSaved.toLocaleTimeString()}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Main Canvas */}
      <div 
        className="absolute inset-0 pt-20"
        onPointerMove={handlePointerMove}
      >
        <Tldraw
          onMount={setEditor}
          shapeUtils={customShapeUtils}
          persistenceKey="ai-canvas-v1"
          shareZone={<div />}
          topZone={<div />}
          options={{
            maxPages: 1,
            maxShapesPerPage: 2000,
          }}
        />
      </div>

      {/* Gesture Overlay */}
      {gestureState.isDetecting && (
        <div className="absolute inset-0 pointer-events-none z-30 bg-gesture-highlight/10">
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
            <div className="bg-background/90 backdrop-blur-sm p-6 rounded-lg border border-border shadow-lg">
              <div className="text-center space-y-3">
                <Wand2 className="h-8 w-8 mx-auto text-primary animate-pulse" />
                <div className="text-sm font-medium">Magic Circle Detected!</div>
                <div className="text-xs text-muted-foreground">
                  Processing your request...
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}