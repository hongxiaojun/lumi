type Props = { className?: string }

/** Shelf mark. Same artwork as the app icon: open book, no owl. */
export function LeafLogo({ className }: Props) {
  return <img className={className} src="/favicon.svg" alt="" draggable={false} />
}
