import { describe, expect, it } from 'vitest'
import {
  AUDIOBOOK_KEY,
  AUDIOBOOK_WAITING,
  addAudiobook,
  audiobookAllowed,
  audiobookBooks,
  audiobookGesture,
  parseAudiobookIds,
  readAudiobookIds,
  removeAudiobook,
  writeAudiobookIds,
} from './audiobookShelf'

function memory(initial?: string) {
  const data = new Map<string, string>()
  if (initial !== undefined) data.set(AUDIOBOOK_KEY, initial)
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
  }
}

describe('parseAudiobookIds', () => {
  it('starts empty when nothing was stored', () => {
    expect(parseAudiobookIds(null)).toEqual([])
    expect(parseAudiobookIds(undefined)).toEqual([])
    expect(parseAudiobookIds('')).toEqual([])
    expect(parseAudiobookIds('[]')).toEqual([])
  })

  it('drops a stored value that is not a list of titles', () => {
    expect(parseAudiobookIds('audiobooks')).toEqual([])
    expect(parseAudiobookIds('{}')).toEqual([])
    expect(parseAudiobookIds('null')).toEqual([])
    expect(parseAudiobookIds('1')).toEqual([])
    expect(parseAudiobookIds('"金线"')).toEqual([])
    expect(parseAudiobookIds('[1, null, {}, true]')).toEqual([])
  })

  it('keeps the first copy of a name and trims blank edges', () => {
    expect(parseAudiobookIds('[" 金线 ", "", "金线", "  ", 2, "认知突围"]')).toEqual(['金线', '认知突围'])
    expect(parseAudiobookIds('["\\u3000金线\\u3000"]')).toEqual(['金线'])
  })
})

describe('add and remove', () => {
  it('does nothing with a blank name and does not reorder a book already in', () => {
    const ids = ['金线', '认知突围']
    expect(addAudiobook(ids, '')).toEqual(['金线', '认知突围'])
    expect(addAudiobook(ids, '   ')).toEqual(['金线', '认知突围'])
    expect(addAudiobook(ids, '认知突围')).toEqual(['金线', '认知突围'])
    expect(ids).toEqual(['金线', '认知突围'])
  })

  it('appends a newly chosen book', () => {
    expect(addAudiobook(['金线'], '认知突围')).toEqual(['金线', '认知突围'])
    expect(addAudiobook([], '  金线  ')).toEqual(['金线'])
  })

  it('removes only the named book and leaves the others in place', () => {
    const ids = ['金线', '认知突围', '费曼']
    expect(removeAudiobook(ids, '认知突围')).toEqual(['金线', '费曼'])
    expect(removeAudiobook(ids, '没有这本书')).toEqual(ids)
    expect(removeAudiobook(ids, '  ')).toEqual(ids)
    expect(ids).toEqual(['金线', '认知突围', '费曼'])
  })
})

describe('who may be prepared', () => {
  const shelf = [
    { id: 'unread', title: '还没翻开', fraction: 0 },
    { id: 'done', title: '已经读完的书', fraction: 1 },
    { id: 'mid', title: '金线', fraction: 0.42 },
  ]

  it('refuses every book until that book is added by hand', () => {
    expect(audiobookAllowed([], 'done')).toBe(false)
    expect(audiobookAllowed(['mid'], 'done')).toBe(false)
    expect(audiobookAllowed(['mid'], '')).toBe(false)
    expect(audiobookAllowed(['mid'], '  mid  ')).toBe(true)
  })

  it('drops the permission again when the book leaves the column', () => {
    const joined = addAudiobook([], 'done')
    expect(audiobookAllowed(joined, 'done')).toBe(true)
    expect(audiobookAllowed(removeAudiobook(joined, 'done'), 'done')).toBe(false)
  })

  it('lists only added books, in the order they were added, and skips a missing file', () => {
    expect(audiobookBooks(shelf, ['done', 'gone', 'mid']).map((book) => book.id)).toEqual(['done', 'mid'])
    expect(audiobookBooks(shelf, []).map((book) => book.id)).toEqual([])
    expect(audiobookBooks(shelf, ['done', 'done']).map((book) => book.id)).toEqual(['done'])
  })

  it('does not put a finished book on the list just because it is finished', () => {
    expect(audiobookBooks(shelf, ['mid']).map((book) => book.id)).toEqual(['mid'])
  })
})

describe('where the gesture lives', () => {
  it('joins from the whole shelf and from finished books', () => {
    expect(audiobookGesture('library')).toBe('join')
    expect(audiobookGesture('finished')).toBe('join')
  })

  it('does not offer joining from the currently reading shelf', () => {
    expect(audiobookGesture('reading')).toBe('none')
  })

  it('leaves the column without deleting the book', () => {
    expect(audiobookGesture('audiobook')).toBe('leave')
  })

  it('says conversion has not started', () => {
    expect(AUDIOBOOK_WAITING).toBe('已加入有声书。转换还没开始。')
  })
})

describe('storage', () => {
  it('round-trips the list on this device', () => {
    const store = memory()
    writeAudiobookIds(store, ['金线', '认知突围'])
    expect(store.getItem(AUDIOBOOK_KEY)).toBe('["金线","认知突围"]')
    expect(readAudiobookIds(store)).toEqual(['金线', '认知突围'])
  })

  it('returns an empty list when storage is missing, broken, or throws', () => {
    expect(readAudiobookIds(null)).toEqual([])
    expect(readAudiobookIds(memory('{"no":"list"}'))).toEqual([])
    const broken = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
    }
    expect(readAudiobookIds(broken)).toEqual([])
    expect(() => writeAudiobookIds(broken, ['金线'])).not.toThrow()
    expect(() => writeAudiobookIds(null, ['金线'])).not.toThrow()
  })
})
