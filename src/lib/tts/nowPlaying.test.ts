import { describe, expect, it } from 'vitest'
import { clipClock, lockCopy } from './nowPlaying'

describe('lockCopy', () => {
  it('puts the book on the card and the sentence under it', () => {
    expect(lockCopy({
      title: ' 瓦尔登湖 ',
      author: '梭罗',
      sentence: '这个门进去的是甘蔗',
    })).toEqual({
      title: '瓦尔登湖',
      artist: '这个门进去的是甘蔗',
      album: '梭罗',
    })
  })

  it('uses the author when the sentence has not started', () => {
    expect(lockCopy({ title: '瓦尔登湖', author: '梭罗', sentence: '  ' })).toEqual({
      title: '瓦尔登湖',
      artist: '梭罗',
      album: '梭罗',
    })
  })

  it('keeps a name when the book has none', () => {
    expect(lockCopy({ title: '', author: '', sentence: '' })).toEqual({
      title: 'Lumi',
      artist: '朗读',
      album: 'Lumi',
    })
  })
})

describe('clipClock', () => {
  it('trusts a measured clip that still contains the playhead', () => {
    expect(clipClock(4, 12, 8)).toEqual({ position: 4, duration: 12 })
  })

  it('does not draw a negative remainder when the file duration is too short', () => {
    expect(clipClock(4, 0.02, 8)).toEqual({ position: 4, duration: 8 })
  })

  it('uses the playhead when there is no estimate yet', () => {
    expect(clipClock(4, 0, 0)).toEqual({ position: 4, duration: 4 })
  })

  it('draws nothing before the first sound', () => {
    expect(clipClock(0, 0, 0)).toBeNull()
    expect(clipClock(Number.NaN, Number.NaN, Number.NaN)).toBeNull()
  })
})
