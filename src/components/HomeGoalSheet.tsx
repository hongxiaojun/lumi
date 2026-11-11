import type { ReactNode } from 'react'
import { menuPress } from '../lib/menuChrome'

type Props = {
  title: string
  onClose: () => void
  children: ReactNode
}

/** A second-level sheet. The wheel stays off the page until this opens. */
export function HomeGoalSheet({ title, onClose, children }: Props) {
  return (
    <div
      className="voice-layer"
      role="presentation"
      onPointerUp={(event) => {
        if (event.target !== event.currentTarget) return
        menuPress(event, onClose)
      }}
    >
      <div
        className="home-goal-sheet"
        role="dialog"
        aria-label={title}
        onPointerUp={(event) => event.stopPropagation()}
      >
        <header className="home-goal-head">
          <h3>{title}</h3>
          <button type="button" onPointerUp={(event) => menuPress(event, onClose)}>
            完成
          </button>
        </header>
        {children}
      </div>
    </div>
  )
}
