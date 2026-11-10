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
export type BuiltinFontId =
  | 'song'
  | 'kinghwa'
  | 'fang'
  | 'zhuque'
  | 'kai'
  | 'localkai'
  | 'wenkai'
  | 'hei'
  | 'yuan'
  | 'pingfang'
  | 'palatino'
  | 'newsreader'
/** `user:` plus the app token for a face stored only on this Mac. */
export type FontId = BuiltinFontId | `user:${string}`
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
  /** Recede other paragraphs while read-aloud is speaking. Off by default. */
  focusRead: boolean
}

export type TranslatorConfig = {
  engine: EngineId
  direction: DirectionPref
  secrets: TranslatorSecrets
}

export type TtsProvider = 'system' | 'cloud' | 'azure'

export type TtsConfig = {
  provider: TtsProvider
  /** 1.0 is normal. System voices and cloud requests both use this scale. */
  rate: number
  /** SpeechSynthesisVoice.voiceURI, empty picks the first matching book language. */
  systemVoice: string
  cloudBaseUrl: string
  cloudKey: string
  cloudModel: string
  cloudVoice: string
  /** Azure Speech region name (eastasia) or a full endpoint host. */
  azureRegion: string
  azureKey: string
  /** Azure neural voice short name, e.g. zh-CN-XiaoxiaoNeural. */
  azureVoice: string
  /** Natural-language delivery hint for OpenAI-compatible speech services. */
  cloudInstructions: string
  /** Reading typography is replaced by a single-column listening layout while speaking. */
  listenLayout: boolean
  /** Listening typography remembers its own size and leading, separate from the reading prefs. */
  listenFontSize: number
  listenLineHeight: number
  /** While listening, blur the other paragraphs and wash the sibling sentences. */
  immersive: boolean
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
