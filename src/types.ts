import type { EngineId, TranslatorSecrets } from './lib/translate/engines'
import type { DirectionPref, ScriptKind } from './lib/translate/lang'

export type ThemeId =
  | 'white'
  | 'page'
  | 'paper'
  | 'cream'
  | 'kraft'
  | 'gray'
  | 'green'
  | 'night'
  | 'warmNight'
  | 'ink'
  | 'dusk'
export type FontId =
  | 'song'
  | 'kinghwa'
  | 'fang'
  | 'zhuque'
  | 'kai'
  | 'wenkai'
  | 'hei'
  | 'yuan'
  | 'pingfang'
  | 'palatino'
  | 'newsreader'
export type FlowId = 'paginated' | 'scrolled'

export type Theme = {
  id: ThemeId
  name: string
  bg: string
  fg: string
  muted: string
  dark?: boolean
}

export type Prefs = {
  theme: ThemeId
  font: FontId
  fontSize: number
  lineHeight: number
  flow: FlowId
  justify: boolean
  parallel: boolean
}

export type TranslatorConfig = {
  engine: EngineId
  direction: DirectionPref
  secrets: TranslatorSecrets
}

export type TocItem = {
  label?: string
  href?: string
  subitems?: TocItem[]
}

export type LibraryBook = {
  id: string
  title: string
  author: string
  fileName: string
  file: Blob
  /** Tauri 桌面版：书原文件在 app_data_dir()/books/ 下的路径；有它时 IndexedDB 不存 file Blob */
  filePath?: string
  cover: Blob | null
  coverUrl?: string
  addedAt: number
  lastOpenedAt: number | null
  cfi: string | null
  fraction: number
  language?: ScriptKind
  parallel?: boolean
  aiSlug?: string
  aiBuiltAt?: number
}

export type RelocateDetail = {
  cfi?: string
  fraction?: number
  tocItem?: TocItem | null
  location?: { current: number; total: number }
  section?: { current: number; total: number }
  range?: Range
}
