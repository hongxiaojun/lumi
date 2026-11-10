import { useEffect, useRef, useState } from 'react'
import type { TtsConfig, TtsProvider } from '../types'
import { azureSpeaker } from '../lib/tts/azure'
import { cloudSpeaker, unlockAudio } from '../lib/tts/cloud'
import { clampRate, rateLabel, speechLang } from '../lib/tts/config'
import type { SpeechUnit } from '../lib/tts/speech'
import { systemSpeaker, systemVoices, subscribeSystemVoices, type SystemVoice } from '../lib/tts/system'
import type { SpeakHandle } from '../lib/tts/types'
import { AzureFields, CloudFields } from './VoiceFields'

type Props = {
  config: TtsConfig
  onChange: (patch: Partial<TtsConfig>) => void
  onClose: () => void
}

const SAMPLE: SpeechUnit = {
  blockIndex: 0,
  text: '这是一段朗读试听。声音自然，句子之间留一点呼吸。',
  start: 0,
  occurrence: 0,
}

export function VoiceSheet({ config, onChange, onClose }: Props) {
  const [voices, setVoices] = useState<SystemVoice[]>(systemVoices)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const handleRef = useRef<SpeakHandle | null>(null)

  useEffect(() => {
    const refresh = () => setVoices(systemVoices())
    refresh()
    const off = subscribeSystemVoices(refresh)
    const timer = window.setInterval(refresh, 500)
    const stop = window.setTimeout(() => window.clearInterval(timer), 4000)
    return () => {
      off()
      window.clearInterval(timer)
      window.clearTimeout(stop)
    }
  }, [])

  useEffect(() => () => handleRef.current?.cancel(), [])

  function patch(next: Partial<TtsConfig>) {
    onChange(next)
  }

  function provider(next: TtsProvider) {
    patch({ provider: next })
  }

  function stopTest() {
    handleRef.current?.cancel()
    handleRef.current = null
    setTesting(false)
  }

  function test() {
    if (testing) {
      stopTest()
      return
    }
    stopTest()
    setError(null)
    setTesting(true)
    if (config.provider !== 'system') unlockAudio()
    const lang = speechLang(undefined, SAMPLE.text)
    const speaker =
      config.provider === 'cloud'
        ? cloudSpeaker(config)
        : config.provider === 'azure'
          ? azureSpeaker(config)
          : systemSpeaker(config, lang)
    handleRef.current = speaker(SAMPLE, {
      onStart: () => setTesting(true),
      onEnd: () => setTesting(false),
      onError: (reason) => {
        setTesting(false)
        setError(reason instanceof Error ? reason.message : '试听没有出声')
      },
    })
  }

  function close() {
    stopTest()
    onClose()
  }

  return (
    <div className="sheet voice-sheet" onClick={(event) => event.stopPropagation()}>
      <header className="panel-head">
        <h3>朗读设置</h3>
        <button className="icon-btn" type="button" onClick={close}>
          完成
        </button>
      </header>

      <div className="setting">
        <label>声音</label>
        <p className="field-hint">系统语音离线可用。云端和 Azure 语音联网出声，声音更自然。</p>
        <div className="chips">
          <button
            type="button"
            className={`chip ${config.provider === 'system' ? 'on' : ''}`}
            aria-pressed={config.provider === 'system'}
            onClick={() => provider('system')}
          >
            系统语音
          </button>
          <button
            type="button"
            className={`chip ${config.provider === 'cloud' ? 'on' : ''}`}
            aria-pressed={config.provider === 'cloud'}
            onClick={() => provider('cloud')}
          >
            云端语音
          </button>
          <button
            type="button"
            className={`chip ${config.provider === 'azure' ? 'on' : ''}`}
            aria-pressed={config.provider === 'azure'}
            onClick={() => provider('azure')}
          >
            Azure
          </button>
        </div>
      </div>

      <div className="setting">
        <label>语速 {rateLabel(config.rate)}</label>
        <input
          className="range"
          type="range"
          min={60}
          max={200}
          step={5}
          value={Math.round(config.rate * 100)}
          aria-label="朗读语速"
          onChange={(event) => patch({ rate: clampRate(Number(event.target.value) / 100) })}
        />
      </div>

      {config.provider === 'system' ? (
        <div className="setting">
          <label>系统声音</label>
          <select
            className="text-input"
            aria-label="系统朗读声音"
            value={config.systemVoice}
            onChange={(event) => patch({ systemVoice: event.target.value })}
          >
            <option value="">自动选择这本书的语言</option>
            {voices.map((voice) => (
              <option key={voice.id} value={voice.id}>
                {voice.name} · {voice.lang}
              </option>
            ))}
          </select>
          {voices.length === 0 ? (
            <p className="field-hint">系统还没有给出声音。可以先试听，或在 iPhone 设置里下载增强语音。</p>
          ) : (
            <p className="field-hint">iPhone 设置 → 辅助功能 → 朗读内容 → 声音，可以下载更自然的增强语音。</p>
          )}
        </div>
      ) : config.provider === 'azure' ? (
        <AzureFields config={config} patch={patch} />
      ) : (
        <CloudFields config={config} patch={patch} />
      )}

      <div className="setting">
        <label>听书排版</label>
        <p className="field-hint">朗读时换成单栏、大字、宽行距。字号和行距独立于阅读排版，互不影响。</p>
        <div className="chips">
          <button
            type="button"
            className={`chip ${config.listenLayout ? 'on' : ''}`}
            aria-pressed={config.listenLayout}
            onClick={() => patch({ listenLayout: true })}
          >
            开
          </button>
          <button
            type="button"
            className={`chip ${config.listenLayout ? '' : 'on'}`}
            aria-pressed={!config.listenLayout}
            onClick={() => patch({ listenLayout: false })}
          >
            关
          </button>
        </div>
        {config.listenLayout ? (
          <>
            <label>听书字号 {config.listenFontSize}px</label>
            <input
              className="range"
              type="range"
              min={18}
              max={34}
              step={1}
              value={config.listenFontSize}
              aria-label="听书字号"
              onChange={(event) => patch({ listenFontSize: Number(event.target.value) })}
            />
            <label>行距 {config.listenLineHeight.toFixed(2)}</label>
            <input
              className="range"
              type="range"
              min={160}
              max={260}
              step={5}
              value={Math.round(config.listenLineHeight * 100)}
              aria-label="听书行距"
              onChange={(event) => patch({ listenLineHeight: Number(event.target.value) / 100 })}
            />
          </>
        ) : null}
      </div>

      <div className="setting">
        <label>沉浸式</label>
        <p className="field-hint">朗读时其他段落模糊变淡，段内其他句子蒙上一层纸色，只留当前句最清晰。</p>
        <div className="chips">
          <button
            type="button"
            className={`chip ${config.immersive ? 'on' : ''}`}
            aria-pressed={config.immersive}
            onClick={() => patch({ immersive: true })}
          >
            开
          </button>
          <button
            type="button"
            className={`chip ${config.immersive ? '' : 'on'}`}
            aria-pressed={!config.immersive}
            onClick={() => patch({ immersive: false })}
          >
            关
          </button>
        </div>
      </div>

      <div className="setting">
        <button className={`btn ${testing ? '' : 'primary'}`} type="button" onClick={test}>
          {testing ? '停止试听' : '试听'}
        </button>
        {error ? <p className="field-hint voice-error">{error}</p> : null}
      </div>
    </div>
  )
}
