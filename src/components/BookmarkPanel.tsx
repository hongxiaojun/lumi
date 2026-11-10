import type { Bookmark } from '../lib/bookmarks'

type Props = {
  marks: Bookmark[]
  current: boolean
  onToggleHere: () => void
  onJump: (cfi: string) => void
  onRemove: (id: string) => void
  onClose: () => void
}

export function BookmarkPanel({ marks, current, onToggleHere, onJump, onRemove, onClose }: Props) {
  return (
    <aside className="drawer" onClick={(e) => e.stopPropagation()}>
      <header className="panel-head">
        <h3>书签</h3>
        <button className="icon-btn" onClick={onClose}>关闭</button>
      </header>
      <button className={`icon-btn ${current ? 'on' : ''}`} onClick={onToggleHere}>
        {current ? '取消此处标记' : '标记此处'}
      </button>
      {marks.length === 0 ? (
        <p className="field-hint">在当前阅读位置做钉子，方便以后跳回来。</p>
      ) : (
        <div className="search-hits">
          {marks.map((row) => (
            <div className="bookmark-row" key={row.id}>
              <button className="search-hit" onClick={() => onJump(row.cfi)}>
                {row.label}
              </button>
              <button className="icon-btn" onClick={() => onRemove(row.id)}>
                删除
              </button>
            </div>
          ))}
        </div>
      )}
    </aside>
  )
}
