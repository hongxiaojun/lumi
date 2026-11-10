import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearListenWash, paintListenWash, WASH_PREFIX } from './listenWash'
import type { SpeechUnit } from './tts/speech'

const unit = (blockIndex: number, text: string): SpeechUnit => ({ blockIndex, text, start: 0, occurrence: 0 })

type Painter = { add: (key: string, range: Range) => void; remove: (key: string) => void }

function dom(): HTMLElement[] {
  document.body.innerHTML = `
    <div id="root">
      <p id="b0">甲句。乙句。丙句。</p>
      <p id="b1">别段丁句。</p>
    </div>
  `
  return [document.getElementById('b0')!, document.getElementById('b1')!]
}

afterEach(() => {
  document.body.innerHTML = ''
  clearListenWash({ add: () => {}, remove: () => {} })
  vi.restoreAllMocks()
})

describe('paintListenWash', () => {
  it('washes the sibling sentences of the current block, not other blocks', () => {
    const sources = dom()
    const added: string[] = []
    const painter: Painter = { add: (key) => added.push(key), remove: vi.fn() }
    const units = [unit(0, '甲句。'), unit(0, '乙句。'), unit(0, '丙句。'), unit(1, '别段丁句。')]

    paintListenWash(units, 1, sources, painter)
    expect(added).toEqual([`${WASH_PREFIX}-0`, `${WASH_PREFIX}-2`])
    expect(added.every((key) => !key.endsWith('-3'))).toBe(true)
  })

  it('moves the wash when the sentence advances and drops stale keys', () => {
    const sources = dom()
    const added: string[] = []
    const removed: string[] = []
    const painter: Painter = {
      add: (key) => added.push(key),
      remove: (key) => removed.push(key),
    }
    const units = [unit(0, '甲句。'), unit(0, '乙句。'), unit(0, '丙句。')]

    paintListenWash(units, 0, sources, painter)
    expect(added).toEqual([`${WASH_PREFIX}-1`, `${WASH_PREFIX}-2`])
    expect(removed).toEqual([])

    added.length = 0
    removed.length = 0
    paintListenWash(units, 1, sources, painter)
    // wash-2 was already on the page and stays untouched.
    expect(added).toEqual([`${WASH_PREFIX}-0`])
    expect(removed).toEqual([`${WASH_PREFIX}-1`])
  })

  it('clears all wash keys', () => {
    const sources = dom()
    const added: string[] = []
    const removed: string[] = []
    const painter: Painter = {
      add: (key) => added.push(key),
      remove: (key) => removed.push(key),
    }
    const units = [unit(0, '甲句。'), unit(0, '乙句。')]

    paintListenWash(units, 0, sources, painter)
    clearListenWash(painter)
    expect(added.length).toBe(1)
    expect(removed).toEqual(added)
    // A second clear removes nothing further.
    removed.length = 0
    clearListenWash(painter)
    expect(removed).toEqual([])
  })

  it('tolerates a sentence whose ranges cannot be located', () => {
    const sources = dom()
    const painter: Painter = { add: vi.fn(), remove: vi.fn() }
    const units = [unit(0, '不存在的一句。'), unit(0, '乙句。')]

    paintListenWash(units, 0, sources, painter)
    expect(painter.add).toHaveBeenCalledWith(`${WASH_PREFIX}-1`, expect.anything())
  })
})
