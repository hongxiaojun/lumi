import { describe, expect, it } from 'vitest'
import { listenFabMetal, listenFabMode } from './listenFab'
import type { ListenChrome } from './listenChrome'
import type { PlaybackState } from './player'

const chromes: ListenChrome[] = ['open', 'mini', 'hidden']
const phases: PlaybackState[] = ['idle', 'loading', 'playing', 'paused', 'done', 'error']

describe('listenFabMetal', () => {
  it('uses the three home metals for rest, pause, and speech', () => {
    expect(listenFabMetal('idle')).toBe('none')
    expect(listenFabMetal('held')).toBe('silver')
    expect(listenFabMetal('live')).toBe('gold')
  })
})

describe('listenFabMode', () => {
  it('offers 听 before narration starts, even if a player window was left open', () => {
    for (const chrome of chromes) {
      for (const phase of phases) {
        expect(listenFabMode({ active: false, chrome, phase })).toBe('idle')
      }
    }
  })

  it('hides the button while the full player is open', () => {
    for (const phase of phases) {
      expect(listenFabMode({ active: true, chrome: 'open', phase })).toBe('off')
    }
  })

  it('moves while speech is going in the background', () => {
    for (const chrome of ['mini', 'hidden'] as const) {
      expect(listenFabMode({ active: true, chrome, phase: 'playing' })).toBe('live')
      expect(listenFabMode({ active: true, chrome, phase: 'loading' })).toBe('live')
    }
  })

  it('stays still when background speech is paused, finished, or failed', () => {
    for (const chrome of ['mini', 'hidden'] as const) {
      for (const phase of ['paused', 'done', 'error', 'idle'] as const) {
        expect(listenFabMode({ active: true, chrome, phase })).toBe('held')
      }
    }
  })
})
