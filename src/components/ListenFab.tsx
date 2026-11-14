import { listenFabMetal, type ListenFabMode } from '../lib/tts/listenFab'
import { MedalDefs, WeekMedal } from './WeekMedal'

type Props = {
  mode: Exclude<ListenFabMode, 'off'>
  onPress: () => void
}

const LABEL = {
  idle: '开始朗读',
  live: '朗读进行中，展开播放器',
  held: '朗读已暂停，展开播放器',
} as const

const RIM = '32,2 57,16.5 57,47.5 32,62 7,47.5 7,16.5'

/** Medal 听 control. Faint until speech starts. The pulse is the same outer hexagon. */
export function ListenFab({ mode, onPress }: Props) {
  const metal = listenFabMetal(mode)
  return (
    <>
      <MedalDefs />
      <button
        type="button"
        className={mode === 'live' ? 'listen-fab live' : 'listen-fab'}
        data-listen-fab={mode}
        data-metal={metal}
        aria-label={LABEL[mode]}
        onClick={onPress}
      >
        {mode === 'live' ? (
          <svg className="listen-fab-ripple" viewBox="0 0 64 64" aria-hidden="true">
            <polygon fill={`url(#medal-rim-${metal})`} points={RIM} />
          </svg>
        ) : null}
        <WeekMedal label="听" metal={metal} />
      </button>
    </>
  )
}
