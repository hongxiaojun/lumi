import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { writeLibrary } from '../../../vite/leafAiDb.ts'

// 集成测试：在临时书库根下先放两本书，再尝试删除一个会解析成根目录的坏 slug，
// 必须拒绝且不碰任何已有书目。对应 D-01 验收第 3 条。
let root: string

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'lumi-lib-'))
  fs.mkdirSync(path.join(root, 'book-a'), { recursive: true })
  fs.writeFileSync(path.join(root, 'book-a', 'AI.md'), 'A', 'utf8')
  fs.mkdirSync(path.join(root, 'book-b'), { recursive: true })
  fs.writeFileSync(path.join(root, 'book-b', 'AI.md'), 'B', 'utf8')
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

describe('writeLibrary removeSlug safety', () => {
  it('refuses a dot slug and leaves the library root and both books intact', () => {
    expect(() => writeLibrary(root, {}, '.')).toThrow()
    expect(fs.existsSync(root)).toBe(true)
    expect(fs.readFileSync(path.join(root, 'book-a', 'AI.md'), 'utf8')).toBe('A')
    expect(fs.readFileSync(path.join(root, 'book-b', 'AI.md'), 'utf8')).toBe('B')
  })

  it('refuses dot, parent and absolute escapes without deleting anything', () => {
    for (const bad of ['..', '/', '/etc/passwd', 'foo/../..', './', './/.']) {
      expect(() => writeLibrary(root, {}, bad)).toThrow()
    }
    expect(fs.readFileSync(path.join(root, 'book-a', 'AI.md'), 'utf8')).toBe('A')
    expect(fs.readFileSync(path.join(root, 'book-b', 'AI.md'), 'utf8')).toBe('B')
  })

  it('still removes a real book directory without touching its siblings', () => {
    writeLibrary(root, {}, 'book-a')
    expect(fs.existsSync(path.join(root, 'book-a'))).toBe(false)
    expect(fs.readFileSync(path.join(root, 'book-b', 'AI.md'), 'utf8')).toBe('B')
  })
})
