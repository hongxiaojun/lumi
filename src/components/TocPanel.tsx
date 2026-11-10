import type { TocItem } from '../types'

type Props = {
  items: TocItem[]
  onJump: (href: string) => void
  onClose: () => void
}

function Rows({ items, depth, onJump }: { items: TocItem[]; depth: number; onJump: (href: string) => void }) {
  return (
    <>
      {items.map((item, i) => (
        <div key={`${item.href ?? item.label ?? i}-${depth}`}>
          {item.label && (
            <button
              className={`toc-item l${depth}`}
              onClick={() => item.href && onJump(item.href)}
            >
              {item.label}
            </button>
          )}
          {item.subitems?.length ? (
            <Rows items={item.subitems} depth={Math.min(depth + 1, 2)} onJump={onJump} />
          ) : null}
        </div>
      ))}
    </>
  )
}

export function TocPanel({ items, onJump, onClose }: Props) {
  return (
    <aside className="drawer" onClick={(e) => e.stopPropagation()}>
      <header className="panel-head">
        <h3>目录</h3>
        <button className="icon-btn" onClick={onClose}>关闭</button>
      </header>
      {items.length === 0 ? <p className="chapter">这本书没有目录</p> : <Rows items={items} depth={0} onJump={onJump} />}
    </aside>
  )
}
