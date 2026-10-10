import { describe, expect, it } from 'vitest'
import { restyleDocument } from './typeset'

function parse(html: string): Document {
  return new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
}

function text(doc: Document): string {
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim()
}

function paras(html: string): string[] {
  const doc = parse(html)
  restyleDocument(doc, 'zh')
  return [...doc.querySelectorAll('p, div')].map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean)
}

describe('Chinese restyle — screenshot failures', () => {
  it('joins 甚 / 至 across a leftover wrap after a long paragraph that already contains a period', () => {
    const html =
      '<p>你所在的位置会决定你看问题的角度，以及应对的方式。对于同一个问题，改变了位置之后，可能看法会截然不同，甚</p>' +
      '<p>至能够找到更优质的解决方法。</p>'
    expect(paras(html)).toEqual([
      '你所在的位置会决定你看问题的角度，以及应对的方式。对于同一个问题，改变了位置之后，可能看法会截然不同，甚至能够找到更优质的解决方法。',
    ])
  })

  it('joins a split word 但实 / 际上', () => {
    const html =
      '<p>如果你总是以一个“学生”去要求自己，其实无意间降低了自己的标准。因为你的目标只是学会，或者看似学会。但实</p>' +
      '<p>际上检验一个人是否真正掌握了一项技能的最好方法，就是让他把这个技能教给别人。</p>'
    const out = paras(html)
    expect(out).toHaveLength(1)
    expect(out[0]).toContain('但实际上检验')
    expect(out[0]).not.toMatch(/但实 际/)
  })

  it('joins 无可奈 / 何……', () => {
    const html = '<p>只顾着最后在那里发脾气，而后无可奈</p><p>何……</p>'
    expect(paras(html).join('')).toContain('无可奈何……')
  })
})

describe('Chinese restyle — other wrap shapes', () => {
  it('skips an empty paragraph sitting between two wrap fragments', () => {
    const html = '<p>改变了位置之后，可能看法会截然不同，甚</p><p></p><p>至能够找到更优质的解决方法。</p>'
    expect(paras(html)).toEqual([
      '改变了位置之后，可能看法会截然不同，甚至能够找到更优质的解决方法。',
    ])
  })

  it('skips a br between two wrap fragments', () => {
    const html = '<p>而后无可奈</p><br/><p>何……</p>'
    const doc = parse(html)
    restyleDocument(doc, 'zh')
    expect(text(doc)).toBe('而后无可奈何……')
    expect(doc.querySelectorAll('p')).toHaveLength(1)
  })

  it('trims nbsp at the start of the next fragment', () => {
    const html = '<p>可能看法会截然不同，甚</p><p>&nbsp;至能够找到更优质的解决方法。</p>'
    expect(paras(html)[0]).toContain('甚至能够')
  })

  it('unwraps a CJK br inside one paragraph', () => {
    const html = '<p>可能看法会截然不同，甚<br/>至能够找到更优质的解决方法。</p>'
    const doc = parse(html)
    restyleDocument(doc, 'zh')
    expect(doc.querySelectorAll('br')).toHaveLength(0)
    expect(text(doc)).toContain('甚至能够')
  })

  it('merges line-sized divs the same way as p', () => {
    const html = '<div>改变了位置之后，可能看法会截然不同，甚</div><div>至能够找到更优质的解决方法。</div>'
    const doc = parse(html)
    restyleDocument(doc, 'zh')
    expect(text(doc)).toContain('甚至能够找到更优质的解决方法。')
    expect(doc.querySelectorAll('div')).toHaveLength(1)
  })

  it('does not smash a container div that holds real paragraphs', () => {
    const html = '<div><p>第一段是完整的句子。</p><p>第二段也是完整的句子。</p></div>'
    const doc = parse(html)
    restyleDocument(doc, 'zh')
    expect(doc.querySelectorAll('p')).toHaveLength(2)
  })

  it('still unwraps remnants inside a mixed chapter of long and short lines', () => {
    const long = '<p>这是一段结构完整的正文，句子有标点，长度也足够用来模拟正常中文书的段落排版，不应该被当成硬换行。</p>'
    const wrap =
      '<p>对于同一个问题，改变了位置之后，可能看法会截然不同，甚</p><p>至能够找到更优质的解决方法。</p>'
    const html = Array.from({ length: 8 }, () => long).join('') + wrap
    const doc = parse(html)
    restyleDocument(doc, 'zh')
    const joined = [...doc.querySelectorAll('p')].map((el) => el.textContent ?? '').join('|')
    expect(joined).toContain('截然不同，甚至能够找到更优质的解决方法。')
    expect(joined).not.toContain('甚|至')
  })
})

describe('Chinese restyle — must not merge', () => {
  it('keeps a finished sentence as its own paragraph', () => {
    const html = '<p>我们总说：屁股决定脑袋。</p><p>你所在的位置会决定你看问题的角度。</p>'
    expect(paras(html)).toHaveLength(2)
  })

  it('keeps a quoted reply as its own paragraph', () => {
    const html = '<p>面对学习这件事的时候，这句话同样适用</p><p>「要是我也会这个东西就好了。」</p>'
    expect(paras(html)).toHaveLength(2)
  })

  it('keeps a heading-like 第N章', () => {
    const html = '<p>上一章说到这里</p><p>第三章 自学的方法</p>'
    expect(paras(html)).toHaveLength(2)
  })
})
