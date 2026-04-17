import { TLBaseShape } from 'tldraw'

export type InteractionBubbleShape = TLBaseShape<
  'interaction-bubble',
  {
    w: number
    h: number
    question: string
    options: string[]
    selectedOption?: string
    status: 'pending' | 'answered'
  }
>

export const INTERACTION_BUBBLE_SHAPE_TYPE = 'interaction-bubble' as const
