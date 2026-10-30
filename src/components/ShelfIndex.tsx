import { SHELF_INDEX, type ShelfSection } from '../lib/shelfIndex'

type Props = {
  section: ShelfSection
  counts: Record<ShelfSection, number>
  onPick: (next: ShelfSection) => void
}

export function ShelfIndex({ section, counts, onPick }: Props) {
  return (
    <nav className="shelf-index" aria-label="书架分类">
      <p className="shelf-index-kicker">书库</p>
      {SHELF_INDEX.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-current={section === item.id ? 'page' : undefined}
          onClick={() => onPick(item.id)}
        >
          <span>{item.label}</span>
          <span className="shelf-index-count">{counts[item.id]}</span>
        </button>
      ))}
    </nav>
  )
}
