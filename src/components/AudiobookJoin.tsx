type Props = {
  title: string
  joined: boolean
  disabled?: boolean
  onJoin: () => void
}

export function AudiobookJoin({ title, joined, disabled, onJoin }: Props) {
  return (
    <button
      type="button"
      className="book-join"
      disabled={disabled || joined}
      aria-label={joined ? `${title} 已在有声书` : `把${title}加入有声书`}
      onClick={() => {
        if (!disabled && !joined) onJoin()
      }}
    >
      {joined ? '已在有声书' : '加入有声书'}
    </button>
  )
}
