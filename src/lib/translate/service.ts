import { cacheKey } from '../hash'
import { getTranslation, putTranslation } from '../db'
import {
  type EngineId,
  type TranslatorSecrets,
  aiRequest,
  edgeAuthRequest,
  edgeTranslateRequest,
  googleGtxRequest,
  googleRequest,
  microsoftRequest,
  missingSecret,
  parseAi,
  parseGoogle,
  parseMicrosoft,
} from './engines'
import { sendJson, sendRaw } from './http'
import type { TextBlock } from './blocks'
import { capBlocks } from './prefetch'

const BATCH = 8
let edgeToken = ''

export async function translateBlocks(
  blocks: TextBlock[],
  engine: EngineId,
  from: string,
  to: string,
  secrets: TranslatorSecrets,
): Promise<Map<string, string>> {
  const missing = missingSecret(engine, secrets)
  if (missing) throw new Error(missing)
  const out = new Map<string, string>()
  const pending: TextBlock[] = []
  const work = capBlocks(blocks)
  for (const block of work) {
    const key = cacheKey([engine, from, to, block.text])
    const cached = await getTranslation(key)
    if (cached) out.set(block.id, cached)
    else pending.push(block)
  }
  for (let i = 0; i < pending.length; i += BATCH) {
    const batch = pending.slice(i, i + BATCH)
    const texts = batch.map((b) => b.text)
    const translated = await translateTexts(engine, texts, from, to, secrets)
    for (let j = 0; j < batch.length; j++) {
      const block = batch[j]
      const text = translated[j] ?? ''
      out.set(block.id, text)
      await putTranslation(cacheKey([engine, from, to, block.text]), text)
    }
  }
  return out
}

export async function translateTexts(
  engine: EngineId,
  texts: string[],
  from: string,
  to: string,
  secrets: TranslatorSecrets,
): Promise<string[]> {
  if (texts.length === 0) return []
  if (engine === 'google') return translateGoogle(texts, from, to, secrets.googleKey)
  if (engine === 'microsoft') return translateMicrosoft(texts, from, to, secrets)
  const req = aiRequest(texts, from, to, secrets)
  return parseAi(await sendJson(req), texts.length)
}

async function translateGoogle(
  texts: string[],
  from: string,
  to: string,
  key: string,
): Promise<string[]> {
  if (key) {
    return parseGoogle(await sendJson(googleRequest(texts, from, to, key)), texts.length)
  }
  return parseGoogle(await sendJson(googleGtxRequest(texts, from, to)), texts.length)
}

async function translateMicrosoft(
  texts: string[],
  from: string,
  to: string,
  secrets: TranslatorSecrets,
): Promise<string[]> {
  if (secrets.microsoftKey) {
    const req = microsoftRequest(
      texts,
      from,
      to,
      secrets.microsoftKey,
      secrets.microsoftRegion,
    )
    return parseMicrosoft(await sendJson(req), texts.length)
  }
  try {
    if (!edgeToken) edgeToken = (await sendRaw(edgeAuthRequest())).trim()
    return parseMicrosoft(
      await sendJson(edgeTranslateRequest(texts, from, to, edgeToken)),
      texts.length,
    )
  } catch {
    return parseGoogle(await sendJson(googleGtxRequest(texts, from, to)), texts.length)
  }
}
