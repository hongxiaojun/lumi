import type { TranslatorConfig } from '../types'
import type { EngineId } from '../lib/translate/engines'

const ENGINES: { id: EngineId; name: string; hint: string }[] = [
  { id: 'google', name: '谷歌', hint: '免费网页接口，无需密钥。只预译当前章 + 下一章。' },
  { id: 'microsoft', name: '微软', hint: '免费通道优先；失败则回落到谷歌。填密钥则走 Azure。' },
  { id: 'ai', name: 'AI', hint: 'OpenAI 或 Anthropic 兼容口，需 Key。DeepSeek 可填 https://api.deepseek.com 或 https://api.deepseek.com/anthropic。' },
]

type Props = {
  config: TranslatorConfig
  onChange: (config: TranslatorConfig) => void
  onClose: () => void
}

export function EngineSheet({ config, onChange, onClose }: Props) {
  const { secrets } = config
  const setSecret = (patch: Partial<typeof secrets>) =>
    onChange({ ...config, secrets: { ...secrets, ...patch } })

  return (
    <div className="sheet sheet-wide" onClick={(e) => e.stopPropagation()}>
      <h3>翻译引擎</h3>
      <div className="setting">
        <label>引擎</label>
        <div className="chips">
          {ENGINES.map((e) => (
            <button
              key={e.id}
              className={`chip ${config.engine === e.id ? 'on' : ''}`}
              onClick={() => onChange({ ...config, engine: e.id })}
            >
              {e.name}
            </button>
          ))}
        </div>
        <p className="field-hint">{ENGINES.find((e) => e.id === config.engine)?.hint}</p>
      </div>
      <div className="setting">
        <label>方向</label>
        <div className="chips">
          {(
            [
              ['auto', '自动'],
              ['en-zh', '英 → 中'],
              ['zh-en', '中 → 英'],
            ] as const
          ).map(([id, name]) => (
            <button
              key={id}
              className={`chip ${config.direction === id ? 'on' : ''}`}
              onClick={() => onChange({ ...config, direction: id })}
            >
              {name}
            </button>
          ))}
        </div>
      </div>
      {config.engine === 'google' && (
        <Field
          label="Google API Key（可选）"
          value={secrets.googleKey}
          onChange={(v) => setSecret({ googleKey: v })}
        />
      )}
      {config.engine === 'microsoft' && (
        <>
          <Field
            label="微软密钥"
            value={secrets.microsoftKey}
            onChange={(v) => setSecret({ microsoftKey: v })}
          />
          <Field
            label="区域"
            value={secrets.microsoftRegion}
            onChange={(v) => setSecret({ microsoftRegion: v })}
          />
        </>
      )}
      {config.engine === 'ai' && (
        <>
          <Field
            label="Base URL"
            value={secrets.aiBaseUrl}
            onChange={(v) => setSecret({ aiBaseUrl: v })}
          />
          <Field
            label="API Key"
            value={secrets.aiKey}
            onChange={(v) => setSecret({ aiKey: v })}
          />
          <Field
            label="模型"
            value={secrets.aiModel}
            onChange={(v) => setSecret({ aiModel: v })}
          />
        </>
      )}
      <button className="icon-btn" onClick={onClose}>
        完成
      </button>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="setting">
      <label>{label}</label>
      <input
        className="text-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        spellCheck={false}
      />
    </div>
  )
}
