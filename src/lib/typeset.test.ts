import { describe, expect, it } from 'vitest'
import {
  detectBookLanguage,
  languageFromMeta,
  prepareEnglishSection,
  restyleDocument,
  restyleEnglishDocument,
  shouldTypesetEnglish,
} from './typeset'

function parse(html: string): Document {
  return new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
}

function text(doc: Document): string {
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim()
}

describe('languageFromMeta', () => {
  it('reads English from a string code', () => {
    expect(languageFromMeta('en')).toBe('en')
    expect(languageFromMeta('en-US')).toBe('en')
    expect(languageFromMeta('eng')).toBe('en')
  })

  it('reads Chinese from a string code', () => {
    expect(languageFromMeta('zh')).toBe('zh')
    expect(languageFromMeta('zh-CN')).toBe('zh')
    expect(languageFromMeta('zh-Hans')).toBe('zh')
    expect(languageFromMeta('zho')).toBe('zh')
  })

  it('reads an array of codes', () => {
    expect(languageFromMeta(['en-GB'])).toBe('en')
    expect(languageFromMeta(['zh-Hant', 'zh'])).toBe('zh')
  })

  it('returns mixed when both English and Chinese are listed', () => {
    expect(languageFromMeta(['en', 'zh-CN'])).toBe('mixed')
  })

  it('returns null for missing or undetermined language', () => {
    expect(languageFromMeta(undefined)).toBeNull()
    expect(languageFromMeta(null)).toBeNull()
    expect(languageFromMeta('')).toBeNull()
    expect(languageFromMeta('und')).toBeNull()
    expect(languageFromMeta([])).toBeNull()
  })

  it('returns other for Japanese or Korean', () => {
    expect(languageFromMeta('ja')).toBe('other')
    expect(languageFromMeta('ko-KR')).toBe('other')
  })
})

describe('detectBookLanguage', () => {
  it('prefers metadata over the sample', () => {
    expect(detectBookLanguage('en', '这是一段中文说明')).toBe('en')
    expect(detectBookLanguage('zh', 'A long English sample sentence.')).toBe('zh')
  })

  it('falls back to the sample when metadata is missing', () => {
    expect(detectBookLanguage(undefined, 'The unit was never the job.')).toBe('en')
    expect(detectBookLanguage('und', '阅读软件并不缺。')).toBe('zh')
  })

  it('returns other for empty input', () => {
    expect(detectBookLanguage(undefined, '')).toBe('other')
  })
})

describe('shouldTypesetEnglish', () => {
  it('only restyles English books', () => {
    expect(shouldTypesetEnglish('en')).toBe(true)
    expect(shouldTypesetEnglish('zh')).toBe(false)
    expect(shouldTypesetEnglish('mixed')).toBe(false)
    expect(shouldTypesetEnglish('other')).toBe(false)
  })
})

describe('prepareEnglishSection', () => {
  it('promotes a book to English when the section is English', () => {
    const doc = parse('<p>The unit was never the job that paid the bills.</p>')
    expect(prepareEnglishSection(doc, 'zh')).toBe('en')
    expect(doc.body.getAttribute('data-leaf-typeset')).toBe('en')
  })

  it('restyles a Chinese section with the Chinese profile', () => {
    const doc = parse('<p>阅读软件并不缺。缺的是一个安静的地方。</p>')
    expect(prepareEnglishSection(doc, 'zh')).toBe('zh')
    expect(doc.body.getAttribute('data-leaf-typeset')).toBe('zh')
  })
})

describe('restyleDocument Chinese wraps', () => {
  it('merges hard-wrapped Chinese lines without inserting spaces', () => {
    const doc = parse(
      '<p>根据 2017 年的统计数据，从 1977 年到 2017 年，40 年间</p><p>全国大学录取人数总计为 1.15 亿左右。</p>',
    )
    restyleDocument(doc, 'zh')
    expect(doc.querySelectorAll('p')).toHaveLength(1)
    expect(text(doc)).toBe(
      '根据 2017 年的统计数据，从 1977 年到 2017 年，40 年间全国大学录取人数总计为 1.15 亿左右。',
    )
  })

  it('joins a character split across fake paragraphs', () => {
    const doc = parse('<p>但，事实是：他</p><p>们在有人教、有人带、有人逼的情况下都没真学明白。</p>')
    restyleDocument(doc, 'zh')
    expect(text(doc)).toContain('他们在有人教')
    expect(text(doc)).not.toMatch(/他 们/)
  })

  it('does not merge a finished sentence into the next paragraph', () => {
    const doc = parse('<p>不得不承认，应试教育的确是磨灭自学能力的最有效方法。</p><p>在随后的生活里，尽管能意识到自己应该学点什么。</p>')
    restyleDocument(doc, 'zh')
    expect(doc.querySelectorAll('p')).toHaveLength(2)
  })

  it('does not merge a dialogue line that starts with a quote', () => {
    const doc = parse('<p>他说</p><p>「要是我也会这个东西就好了。」</p>')
    restyleDocument(doc, 'zh')
    expect(doc.querySelectorAll('p')).toHaveLength(2)
  })

  it('leaves a normally typeset Chinese chapter alone', () => {
    const blocks = Array.from({ length: 10 }, (_, i) => {
      return `<p>这是一段结构完整的正文，句子有标点，长度也足够用来模拟正常中文书的段落排版，不应该被当成硬换行 ${i}。</p>`
    })
    const doc = parse(blocks.join(''))
    restyleDocument(doc, 'zh')
    expect(doc.querySelectorAll('p')).toHaveLength(10)
  })

  it('unwraps Chinese line-break tags', () => {
    const doc = parse('<p>于是，每<br/>次决心重新做人。</p>')
    restyleDocument(doc, 'zh')
    expect(doc.querySelectorAll('br')).toHaveLength(0)
    expect(text(doc)).toBe('于是，每次决心重新做人。')
  })
})

describe('restyleEnglishDocument', () => {
  it('strips publisher layout styles but keeps italic', () => {
    const doc = parse(
      '<p style="font-family: Times; text-indent: 2em; font-size: 11pt; font-style: italic">Hello</p>',
    )
    restyleEnglishDocument(doc)
    const p = doc.querySelector('p')!
    expect(p.getAttribute('style')).toBe('font-style: italic')
    expect(p.getAttribute('style')).not.toMatch(/text-indent/)
    expect(p.getAttribute('style')).not.toMatch(/font-family/)
  })

  it('drops an inline bold weight so the body face keeps its spacing', () => {
    const doc = parse('<p style="font-weight: bold; font-style: italic">金字塔原理就是</p>')
    restyleEnglishDocument(doc)
    const p = doc.querySelector('p')!
    expect(p.getAttribute('style')).toBe('font-style: italic')
    expect(p.getAttribute('style')).not.toMatch(/font-weight/)
  })

  it('removes publisher stylesheets so reader CSS can take over', () => {
    const doc = parse(
      '<style>p{text-indent:2em}</style><link rel="stylesheet" href="book.css"><p>Hello</p>',
    )
    restyleEnglishDocument(doc)
    expect(doc.querySelectorAll('style')).toHaveLength(0)
    expect(doc.querySelectorAll('link[rel="stylesheet"]')).toHaveLength(0)
  })

  it('keeps Foliate reader CSS hooks', () => {
    const doc = parse(
      '<style>@namespace epub "http://www.idpf.org/2007/ops"; p{margin:0 0 1.2em}</style><style>p{text-indent:2em}</style><p>Hello</p>',
    )
    restyleEnglishDocument(doc)
    const css = [...doc.querySelectorAll('style')].map((node) => node.textContent).join('\n')
    expect(css).toMatch(/@namespace epub/)
    expect(css).not.toMatch(/text-indent:2em/)
  })

  it('merges hard-wrapped paragraphs in XHTML where tagName is lowercase', () => {
    const doc = new DOMParser().parseFromString(
      '<html xmlns="http://www.w3.org/1999/xhtml"><body><p>The unit was never the</p><p>job that paid the bills.</p></body></html>',
      'application/xhtml+xml',
    )
    expect(doc.querySelector('p')?.tagName).toBe('p')
    restyleEnglishDocument(doc)
    expect(doc.querySelectorAll('p')).toHaveLength(1)
  })

  it('unwraps hard line breaks when the next line continues in lowercase', () => {
    const doc = parse('<p>The unit was never the<br/> job that paid the bills.</p>')
    restyleEnglishDocument(doc)
    expect(doc.querySelectorAll('br')).toHaveLength(0)
    expect(text(doc)).toBe('The unit was never the job that paid the bills.')
  })

  it('keeps line breaks before a capital letter (addresses, verse)', () => {
    const doc = parse('<p>Jane Doe<br/>123 Main Street<br/>Springfield</p>')
    restyleEnglishDocument(doc)
    expect(doc.querySelectorAll('br')).toHaveLength(2)
  })

  it('does not unwrap breaks inside pre or code', () => {
    const doc = parse('<pre>line one<br/>line two</pre>')
    restyleEnglishDocument(doc)
    expect(doc.querySelectorAll('pre br')).toHaveLength(1)
  })

  it('merges consecutive paragraphs that were hard-wrapped', () => {
    const doc = parse(
      '<p>The unit was never the</p><p>job that paid the bills.</p>',
    )
    restyleEnglishDocument(doc)
    const paras = [...doc.querySelectorAll('p')]
    expect(paras).toHaveLength(1)
    expect(text(doc)).toBe('The unit was never the job that paid the bills.')
  })

  it('merges three wrapped fragments into one paragraph', () => {
    const doc = parse(
      '<p>She opened the</p><p>window and let the</p><p>cold air in.</p>',
    )
    restyleEnglishDocument(doc)
    expect(doc.querySelectorAll('p')).toHaveLength(1)
    expect(text(doc)).toBe('She opened the window and let the cold air in.')
  })

  it('does not merge complete sentences', () => {
    const doc = parse('<p>The unit was never the job.</p><p>It was the people.</p>')
    restyleEnglishDocument(doc)
    expect(doc.querySelectorAll('p')).toHaveLength(2)
  })

  it('does not merge verse lines that start with a capital', () => {
    const doc = parse('<p>Roses are red</p><p>Violets are blue</p>')
    restyleEnglishDocument(doc)
    expect(doc.querySelectorAll('p')).toHaveLength(2)
  })

  it('does not merge across a heading', () => {
    const doc = parse('<p>The unit was never the</p><h2>Chapter Two</h2><p>job.</p>')
    restyleEnglishDocument(doc)
    expect(doc.querySelector('h2')?.textContent).toBe('Chapter Two')
    expect(doc.querySelectorAll('p')).toHaveLength(2)
  })

  it('does not merge list items', () => {
    const doc = parse('<ul><li>the first</li><li>item continues</li></ul>')
    restyleEnglishDocument(doc)
    expect(doc.querySelectorAll('li')).toHaveLength(2)
  })

  it('preserves a blockquote of complete sentences', () => {
    const doc = parse(
      '<blockquote><p>The unit was never the job.</p><p>It was the people.</p></blockquote>',
    )
    restyleEnglishDocument(doc)
    expect(doc.querySelectorAll('blockquote p')).toHaveLength(2)
  })

  it('still merges hard-wrapped lines inside a blockquote', () => {
    const doc = parse(
      '<blockquote><p>The unit was never the</p><p>job that paid the bills.</p></blockquote>',
    )
    restyleEnglishDocument(doc)
    expect(doc.querySelectorAll('blockquote p')).toHaveLength(1)
  })

  it('drops empty and nbsp-only paragraphs', () => {
    const doc = parse('<p>&nbsp;</p><p>Hello.</p><p>   </p><p><br/></p>')
    restyleEnglishDocument(doc)
    expect(doc.querySelectorAll('p')).toHaveLength(1)
    expect(text(doc)).toBe('Hello.')
  })

  it('keeps a paragraph that only contains an image', () => {
    const doc = parse('<p><img src="cover.jpg" alt="cover"></p>')
    restyleEnglishDocument(doc)
    expect(doc.querySelectorAll('p')).toHaveLength(1)
    expect(doc.querySelector('img')).not.toBeNull()
  })

  it('is idempotent', () => {
    const doc = parse('<p>The unit was never the</p><p>job that paid the bills.</p>')
    expect(restyleEnglishDocument(doc)).toBe(true)
    expect(restyleEnglishDocument(doc)).toBe(false)
    expect(doc.querySelectorAll('p')).toHaveLength(1)
  })

  it('returns false for an empty document', () => {
    const doc = new DOMParser().parseFromString('', 'text/html')
    doc.body.replaceChildren()
    expect(restyleEnglishDocument(doc)).toBe(false)
  })

  it('treats a curly-quoted sentence as complete', () => {
    const doc = parse('<p>The unit was never the job.”</p><p>It was the people.</p>')
    restyleEnglishDocument(doc)
    expect(doc.querySelectorAll('p')).toHaveLength(2)
  })

  it('merges when the first line ends with an em dash', () => {
    const doc = parse('<p>The unit was never the job —</p><p>it was the people.</p>')
    restyleEnglishDocument(doc)
    expect(doc.querySelectorAll('p')).toHaveLength(1)
  })

  it('unwraps a break nested inside a span', () => {
    const doc = parse('<p>The unit was never the <span>real<br/> job</span>.</p>')
    restyleEnglishDocument(doc)
    expect(doc.querySelectorAll('br')).toHaveLength(0)
    expect(text(doc)).toBe('The unit was never the real job.')
  })

  it('does not merge a paragraph into the next if it already ends a sentence', () => {
    const doc = parse('<p>Done.</p><p>and then something else.</p>')
    restyleEnglishDocument(doc)
    expect(doc.querySelectorAll('p')).toHaveLength(2)
  })
})
