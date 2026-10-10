import { useEffect, useRef, useState } from 'react'
import type { SearchHit } from '../lib/searchHits'
import { SEARCH_CAP } from '../lib/searchHits'

type Props = {
  hits: SearchHit[]
  searching: boolean
  capped: boolean
  onQuery: (query: string) => void
  onJump: (cfi: string) => void
  onClose: () => void
}

export function SearchPanel({ hits, searching, capped, onQuery, onJump, onClose }: Props) {
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => onQuery(text), 280)
    return () => window.clearTimeout(timer)
  }, [text, onQuery])

  return (
    <aside className="drawer" onClick={(e) => e.stopPropagation()}>
      <h3>搜索</h3>
      <input
        ref={inputRef}
        className="text-input"
        type="search"
        value={text}
        placeholder="书内全文"
        aria-label="书内全文"
        onChange={(e) => setText(e.target.value)}
      />
      <p className="field-hint">
        {searching ? '正在查找…' : hits.length ? `${hits.length} 处` : text.trim() ? '没有匹配' : '输入后查找全书'}
        {capped ? ` · 最多 ${SEARCH_CAP} 条` : ''}
      </p>
      <div className="search-hits">
        {hits.map((hit) => (
          <button
            key={hit.cfi}
            className="search-hit"
            onClick={() => onJump(hit.cfi)}
          >
            {hit.label ? <span className="search-hit-label">{hit.label}</span> : null}
            <span>
              {hit.pre}
              <mark>{hit.match}</mark>
              {hit.post}
            </span>
          </button>
        ))}
      </div>
      <button className="icon-btn" onClick={onClose} style={{ marginTop: 12 }}>
        关闭
      </button>
    </aside>
  )
}
