import { describe, expect, it } from 'vitest'
import { readSearchHistory, rememberSearch, SEARCH_HISTORY_LIMIT } from './searchHistory'

describe('rememberSearch', () => {
  it('ignores a blank query', () => {
    expect(rememberSearch(['金钱'], '   ')).toEqual(['金钱'])
    expect(rememberSearch([], '')).toEqual([])
  })

  it('puts the newest query first and drops the duplicate', () => {
    expect(rememberSearch(['时间', '金钱'], '金钱')).toEqual(['金钱', '时间'])
  })

  it('treats the same letters in another case as one record and keeps the latest spelling', () => {
    expect(rememberSearch(['money'], 'Money')).toEqual(['Money'])
  })

  it('keeps a CJK query and stops at five', () => {
    const older = ['五', '四', '三', '二', '一']
    expect(rememberSearch(older, '金钱心理学')).toEqual(['金钱心理学', '五', '四', '三', '二'])
    expect(rememberSearch(older, '金钱心理学')).toHaveLength(SEARCH_HISTORY_LIMIT)
  })
})

describe('readSearchHistory', () => {
  it('returns nothing when storage is missing or broken', () => {
    expect(readSearchHistory(null)).toEqual([])
    expect(readSearchHistory({ getItem: () => '{' })).toEqual([])
    expect(readSearchHistory({ getItem: () => '{"a":1}' })).toEqual([])
  })

  it('keeps the first five non-empty strings and skips blanks', () => {
    const raw = JSON.stringify([' 金钱 ', '', '时间', 3, '真相', '朋友', '投资', '第六'])
    expect(readSearchHistory({ getItem: () => raw })).toEqual(['金钱', '时间', '真相', '朋友', '投资'])
  })
})
