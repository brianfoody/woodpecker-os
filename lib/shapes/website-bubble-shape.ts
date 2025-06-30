import { TLBaseShape } from 'tldraw'

export type WebsiteBubbleShape = TLBaseShape<
  'website-bubble',
  {
    w: number
    h: number
    sketchDescription: string
    status: 'creating' | 'deploying' | 'complete' | 'failed'
    progress?: number
    netlifyUrl?: string
    boltUrl?: string
    errorMessage?: string
    jobId: string
  }
>

export const WEBSITE_BUBBLE_SHAPE_TYPE = 'website-bubble' as const