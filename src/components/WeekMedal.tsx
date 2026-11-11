/** Shared metal gradients for the seven weekday medals. */
export function MedalDefs() {
  return (
    <svg className="home-medal-defs" width="0" height="0" aria-hidden="true">
      <defs>
        <linearGradient id="medal-rim-none" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7a7a80" />
          <stop offset="0.5" stopColor="#4a4a4f" />
          <stop offset="1" stopColor="#2c2c30" />
        </linearGradient>
        <linearGradient id="medal-face-none" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5c5c62" />
          <stop offset="1" stopColor="#2a2a2e" />
        </linearGradient>
        <linearGradient id="medal-wedge-none" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3e3e44" />
          <stop offset="1" stopColor="#1c1c20" />
        </linearGradient>
        <linearGradient id="medal-rim-silver" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.4" stopColor="#c5ced8" />
          <stop offset="0.72" stopColor="#7f8b99" />
          <stop offset="1" stopColor="#f5f7fa" />
        </linearGradient>
        <linearGradient id="medal-face-silver" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.55" stopColor="#e4ebf2" />
          <stop offset="1" stopColor="#b4c0cc" />
        </linearGradient>
        <linearGradient id="medal-wedge-silver" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#aeb8c4" />
          <stop offset="1" stopColor="#6a7582" />
        </linearGradient>
        <linearGradient id="medal-rim-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff6d2" />
          <stop offset="0.42" stopColor="#e2b34a" />
          <stop offset="0.75" stopColor="#8d6a22" />
          <stop offset="1" stopColor="#ffe7a3" />
        </linearGradient>
        <linearGradient id="medal-face-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff3c4" />
          <stop offset="0.5" stopColor="#f0c14d" />
          <stop offset="1" stopColor="#c8922a" />
        </linearGradient>
        <linearGradient id="medal-wedge-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c4a056" />
          <stop offset="1" stopColor="#6e5420" />
        </linearGradient>
      </defs>
    </svg>
  )
}

/** One weekday medal. The metal name picks the gradient painted on the face. */
export function WeekMedal({ label, metal }: { label: string; metal: 'none' | 'silver' | 'gold' }) {
  return (
    <svg className="home-medal" viewBox="0 0 64 64" aria-hidden="true">
      <polygon className="home-medal-rim" fill={`url(#medal-rim-${metal})`} points="32,2 57,16.5 57,47.5 32,62 7,47.5 7,16.5" />
      <polygon className="home-medal-face" fill={`url(#medal-face-${metal})`} points="32,8 51,19 51,45 32,56 13,45 13,19" />
      <polygon className="home-medal-wedge" fill={`url(#medal-wedge-${metal})`} points="13,34 49,44 32,56 13,45" />
      <polygon className="home-medal-gloss" points="20,18 32,11 44,18 38,16 32,13 26,16" />
      <text x="32" y="31">{label}</text>
    </svg>
  )
}
