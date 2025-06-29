import { TLBaseShape } from 'tldraw'

export type MessageBubbleShape = TLBaseShape<
  'message-bubble',
  {
    w: number
    h: number
    personName: string
    text: string
    phoneNumber?: string
    replyText?: string
    state: 'sending' | 'sent' | 'failed' | 'reply-available' | 'reply'
    priority: 'normal' | 'important' | 'urgent'
  }
>

export const MESSAGE_BUBBLE_SHAPE_TYPE = 'message-bubble' as const