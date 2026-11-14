import { useEffect, useRef, useState } from 'react'
import { bindCoverSpread, coverTurn, type SpreadPage } from '../lib/tts/coverSpread'

type Props = {
  title: string
  src: string | null
  line: string
}

/** Cover, then the spoken sentence. A leftward slide turns the page. */
export function CoverSpread({ title, src, line }: Props) {
  const [page, setPage] = useState<SpreadPage>(0)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = root.current
    if (!el) return
    return bindCoverSpread(el, (dx, dy) => {
      setPage((current) => coverTurn(current, dx, dy))
    })
  }, [])

  return (
    <div ref={root} className="listen-spread" data-page={page}>
      <div className="listen-spread-track">
        <div className="listen-spread-page">
          <div className="listen-cover">
            {src ? <img src={src} alt="" draggable={false} /> : <div className="listen-cover-fallback">{title}</div>}
          </div>
        </div>
        <div className="listen-spread-page">
          <p className="listen-words">{line || '开始朗读后，句子出现在这一页'}</p>
        </div>
      </div>
    </div>
  )
}
