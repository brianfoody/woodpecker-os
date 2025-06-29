import { TLBaseShape } from 'tldraw'

export type AIBubbleShape = TLBaseShape<
  'ai-bubble',
  {
    w: number
    h: number
    content: string
    isLoading: boolean
  }
>

// Ensure this module is properly exported
export const AI_BUBBLE_SHAPE_TYPE = 'ai-bubble' as const