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

/** Medal 听 control. Gray at rest, silver when paused, gold while speaking. */
export function ListenFab({ mode, onPress }: Props) {
  return (
    <>
      <MedalDefs />
      <button
        type="button"
        className="listen-fab"
        data-listen-fab={mode}
        data-metal={listenFabMetal(mode)}
        aria-label={LABEL[mode]}
        onClick={onPress}
      >
        <WeekMedal label="听" metal={listenFabMetal(mode)} />
      </button>
    </>
  )
}
