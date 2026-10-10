export type HubUser = { id: string; name: string; createdAt: number }

export type HubBookMeta = {
  id: string
  title: string
  author: string
  fileName: string
  addedAt: number
  language?: string
  aiSlug?: string
  aiBuiltAt?: number
  hasCover: boolean
}

export type HubProgress = {
  cfi: string | null
  fraction: number
  lastOpenedAt: number | null
  parallel?: boolean
}

export type HubShelfBook = HubBookMeta & HubProgress
