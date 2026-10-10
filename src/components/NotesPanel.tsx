import type { Annotation, NoteColor } from '../lib/notes'
import { NOTE_COLORS } from '../lib/notes'

type Props = {
  notes: Annotation[]
  onJump: (cfi: string) => void
  onRemove: (id: string) => void
  onChangeNote: (row: Annotation, note: string) => void
  onChangeColor: (row: Annotation, color: NoteColor) => void
  onClose: () => void
}

export function NotesPanel({ notes, onJump, onRemove, onChangeNote, onChangeColor, onClose }: Props) {
  return (
    <aside className="drawer drawer-right" onClick={(e) => e.stopPropagation()}>
      <h3>笔记</h3>
      {notes.length === 0 ? (
        <p className="chapter">选中文字后点「划线」或「想法」</p>
      ) : (
        notes.map((row) => (
          <article className="note-card" key={row.id}>
            <button
              className="note-quote"
              disabled={row.anchor === 'orphan'}
              onClick={() => onJump(row.cfi)}
            >
              <i style={{ background: NOTE_COLORS.find((c) => c.id === row.color)?.hex }} />
              {row.text}
            </button>
            {row.anchor === 'orphan' && <p className="chapter">引用失效，原文里已经找不到这句</p>}
            {row.anchor === 'ambiguous' && <p className="chapter">这句出现了多次，没有钉住</p>}
            <div className="note-pens">
              {NOTE_COLORS.map((pen) => (
                <button
                  key={pen.id}
                  className={`note-pen ${row.color === pen.id ? 'on' : ''}`}
                  style={{ background: pen.hex }}
                  title={pen.name}
                  onClick={() => onChangeColor(row, pen.id)}
                />
              ))}
            </div>
            <textarea
              placeholder="写下想法"
              value={row.note}
              onChange={(e) => onChangeNote(row, e.target.value)}
            />
            <button className="icon-btn" onClick={() => onRemove(row.id)}>
              删除
            </button>
          </article>
        ))
      )}
      <button className="icon-btn" onClick={onClose} style={{ marginTop: 12 }}>
        关闭
      </button>
    </aside>
  )
}
