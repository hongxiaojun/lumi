import { describe, expect, it } from 'vitest'
import { samePlayback, shelfPlayAction, spokenLine, type ShelfPlayback } from './shelfListen'

const playing: ShelfPlayback = {
  bookId: 'book-a',
  active: true,
  phase: 'playing',
  text: '这个门进去的是甘蔗',
  error: null,
}

describe('shelfPlayAction', () => {
  it('starts a book when nothing is speaking', () => {
    expect(shelfPlayAction('book-a', null)).toBe('open')
  })

  it('pauses the book that is already speaking', () => {
    expect(shelfPlayAction('book-a', playing)).toBe('toggle')
  })

  it('starts a different book instead of pausing the current one', () => {
    expect(shelfPlayAction('book-b', playing)).toBe('open')
  })

  it('starts again after the session has stopped', () => {
    expect(shelfPlayAction('book-a', { ...playing, active: false })).toBe('open')
  })
})

describe('spokenLine', () => {
  it('is empty when listen is off', () => {
    expect(spokenLine(null)).toBe('')
    expect(spokenLine({ ...playing, active: false })).toBe('')
  })

  it('shows the sentence while it is playing or paused', () => {
    expect(spokenLine(playing)).toBe('这个门进去的是甘蔗')
    expect(spokenLine({ ...playing, phase: 'paused' })).toBe('这个门进去的是甘蔗')
  })

  it('names the wait, the pause, and the failure when there is no sentence yet', () => {
    expect(spokenLine({ ...playing, text: '  ', phase: 'loading' })).toBe('正在准备…')
    expect(spokenLine({ ...playing, text: '', phase: 'paused' })).toBe('已暂停')
    expect(spokenLine({ ...playing, text: '', phase: 'done' })).toBe('这一章读完了')
    expect(spokenLine({ ...playing, phase: 'error', error: '没有网络' })).toBe('没有网络')
    expect(spokenLine({ ...playing, phase: 'error', text: '', error: '  ' })).toBe('朗读没有出声')
  })
})

describe('samePlayback', () => {
  it('treats an unchanged snapshot as the same', () => {
    expect(samePlayback(playing, { ...playing })).toBe(true)
    expect(samePlayback(playing, { ...playing, text: '下一句' })).toBe(false)
    expect(samePlayback(null, null)).toBe(true)
    expect(samePlayback(playing, null)).toBe(false)
  })
})
