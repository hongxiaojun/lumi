import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createHub } from '../../../vite/hubStore.ts'

const mac = '11111111-1111-4111-8111-111111111111'
const phone = '22222222-2222-4222-8222-222222222222'
const book = '33333333-3333-4333-8333-333333333333'

let root = ''

afterEach(() => {
  if (root) fs.rmSync(root, { recursive: true, force: true })
})

function hub() {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'leaf-hub-'))
  return createHub(root)
}

describe('hub accounts and shelf', () => {
  it('creates a device account once and does not rename it on the next visit', () => {
    const shelf = hub()
    const first = shelf.session(mac, 'Mac-1111')
    const second = shelf.session(mac, '别的名字')
    expect(second).toEqual(first)
    expect(shelf.session(phone, 'iPhone-2222').id).toBe(phone)
  })

  it('keeps progress, notes, and bookmarks on the device that wrote them', () => {
    const shelf = hub()
    shelf.session(mac, 'Mac-1111')
    shelf.session(phone, 'iPhone-2222')
    shelf.saveMeta({
      id: book,
      title: '试读',
      author: '叶读',
      fileName: 'sample.epub',
      addedAt: 1,
    })
    fs.writeFileSync(shelf.filePath(book), Buffer.from('epub'))
    shelf.saveProgress(mac, book, { cfi: '/mac', fraction: 0.2, lastOpenedAt: 10 })
    shelf.saveProgress(phone, book, { cfi: '/phone', fraction: 0.8, lastOpenedAt: 20 })
    shelf.putNote(mac, {
      id: 'n1',
      bookId: book,
      cfi: '/mac',
      text: '只在 Mac',
      note: '',
      color: 'yellow',
      createdAt: 1,
    })
    shelf.putBookmark(phone, { id: 'm1', bookId: book, cfi: '/phone', label: '手机书签', createdAt: 2 })

    const macShelf = shelf.listShelf(mac)
    const phoneShelf = shelf.listShelf(phone)
    expect(macShelf[0].cfi).toBe('/mac')
    expect(macShelf[0].fraction).toBe(0.2)
    expect(phoneShelf[0].cfi).toBe('/phone')
    expect(shelf.notes(mac).map((row) => row.text)).toEqual(['只在 Mac'])
    expect(shelf.notes(phone)).toEqual([])
    expect(shelf.bookmarks(phone).map((row) => row.label)).toEqual(['手机书签'])
    expect(shelf.bookmarks(mac)).toEqual([])
  })

  it('keeps each device’s look for each book', () => {
    const shelf = hub()
    shelf.session(mac, 'Mac-1111')
    shelf.session(phone, 'iPhone-2222')
    shelf.saveMeta({ id: book, title: '试读', author: '叶', fileName: 'a.epub', addedAt: 1 })
    const other = '55555555-5555-4555-8555-555555555555'
    shelf.saveMeta({ id: other, title: '另一本', author: '叶', fileName: 'b.epub', addedAt: 2 })
    shelf.saveBookLook(mac, book, { fontSize: 16, theme: 'white' })
    shelf.saveBookLook(phone, book, { fontSize: 22, theme: 'night' })
    shelf.saveBookLook(mac, other, { fontSize: 14, theme: 'ink' })
    expect(shelf.bookLook(mac, book)).toEqual({ fontSize: 16, theme: 'white' })
    expect(shelf.bookLook(phone, book)).toEqual({ fontSize: 22, theme: 'night' })
    expect(shelf.bookLook(mac, other)).toEqual({ fontSize: 14, theme: 'ink' })
    expect(shelf.bookLook(phone, other)).toBeNull()
  })

  it('rejects a user id that could escape the directory', () => {
    const shelf = hub()
    expect(() => shelf.session('../etc', 'x')).toThrow(/bad id/)
  })

  it('removes the shared book without deleting the other device account', () => {
    const shelf = hub()
    shelf.session(mac, 'Mac-1111')
    shelf.session(phone, 'iPhone-2222')
    shelf.saveMeta({ id: book, title: '试读', author: '叶读', fileName: 'a.epub', addedAt: 1 })
    fs.writeFileSync(shelf.filePath(book), Buffer.from('epub'))
    shelf.putNote(phone, {
      id: 'n1',
      bookId: book,
      cfi: '/1',
      text: '手机笔记',
      note: '',
      color: 'yellow',
      createdAt: 1,
    })
    shelf.removeBook(book)
    expect(shelf.listShelf(mac)).toEqual([])
    expect(shelf.notes(phone)).toEqual([])
    expect(shelf.session(phone, 'ignored').name).toBe('iPhone-2222')
  })
})
