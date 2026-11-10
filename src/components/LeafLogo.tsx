type Props = { className?: string }

/** Shelf mark: the plain owl. The Dock icon is the same owl with sparkles. */
export function LeafLogo({ className }: Props) {
  return <img className={className} src="/favicon.svg" alt="" draggable={false} />
}
