import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import type { NoteColor } from '../lib/notes'
import { NOTE_COLORS } from '../lib/notes'
import { placeSelectionBar, type BarAnchor, type BarInset } from '../lib/annotate'

type Props = {
  top: number
  bottom: number
  center: number
  stageRef: RefObject<HTMLElement | null>
  onHighlight: (color: NoteColor) => void
  onNote: () => void
  onTranslate: () => void
}

function stageInset(stage: HTMLElement | null, host: HTMLElement): Partial<BarInset> {
  if (!stage) return {}
  const box = stage.getBoundingClientRect()
  const base = host.getBoundingClientRect()
  if (box.width === 0 || box.height === 0) return {}
  return {
    top: Math.max(0, box.top - base.top),
    // The stage's bottom is the page margin, not the reachable edge. The
    // webview already stops above the home indicator, so the bar may use the
    // host's remaining height below the page.
    bottom: 0,
    left: Math.max(0, box.left - base.left),
    right: Math.max(0, base.right - box.right),
  }
}

export function SelectionBar({
  top, bottom, center, stageRef, onHighlight, onNote, onTranslate,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState({ top, left: center })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      const host = el.offsetParent instanceof HTMLElement ? el.offsetParent : null
      if (!host) return
      const anchor: BarAnchor = { top, bottom, center }
      const inset = stageInset(stageRef.current, host)
      const bound = {
        width: host.clientWidth || window.innerWidth,
        height: host.clientHeight || window.innerHeight,
      }
      const size = { width: el.offsetWidth, height: el.offsetHeight }
      setPlace(placeSelectionBar(
        anchor,
        size,
        bound,
        8,
        inset,
        (inset.top ?? 0) > 0,
      ))
    }
    update()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    observer?.observe(el)
    if (stageRef.current) observer?.observe(stageRef.current)
    window.addEventListener('resize', update)
    window.visualViewport?.addEventListener('resize', update)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('resize', update)
    }
  }, [top, bottom, center, stageRef])

  return (
    <div
      ref={ref}
      className="sel-bar"
      style={{ top: place.top, left: place.left }}
      onPointerDown={(e) => e.preventDefault()}
    >
      <div className="sel-pens">
        {NOTE_COLORS.map((pen) => (
          <button
            key={pen.id}
            className="sel-pen"
            title={pen.name}
            aria-label={pen.name}
            onClick={() => onHighlight(pen.id)}
          >
            <span style={{ background: pen.hex }} />
          </button>
        ))}
      </div>
      <div className="sel-actions">
        <button type="button" onClick={onNote}>
          想法
        </button>
        <button type="button" onClick={onTranslate}>
          译此段
        </button>
      </div>
    </div>
  )
}
