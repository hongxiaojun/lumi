import type { NoteColor } from '../lib/notes'
import { NOTE_COLORS } from '../lib/notes'

type Props = {
  top: number
  left: number
  onHighlight: (color: NoteColor) => void
  onNote: () => void
  onTranslate: () => void
}

export function SelectionBar({ top, left, onHighlight, onNote, onTranslate }: Props) {
  return (
    <div
      className="sel-bar"
      style={{ top, left }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="sel-pens">
        {NOTE_COLORS.map((pen) => (
          <button
            key={pen.id}
            className="sel-pen"
            style={{ background: pen.hex }}
            title={pen.name}
            onClick={() => onHighlight(pen.id)}
          />
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
