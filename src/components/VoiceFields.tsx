import { useCallback, useState } from 'react'
import type { TtsConfig } from '../types'
import { cloudVoicePresets, listAzureVoices, listCloudModels, type CatalogOption } from '../lib/tts/catalog'
import { cleanSecret } from '../lib/tts/config'

type Props = {
  config: TtsConfig
  patch: (next: Partial<TtsConfig>) => void
}

type Catalog = {
  options: CatalogOption[] | null
  busy: boolean
  error: string | null
  refresh: () => Promise<void>
}

/** A select over fetched options that falls back to a plain text field. */
function CatalogField({
  label,
  ariaLabel,
  value,
  catalog,
  placeholder,
  hint,
  onCommit,
  onCredsBlur,
}: {
  label: string
  ariaLabel: string
  value: string
  catalog: Catalog
  placeholder: string
  hint: string
  onCommit: (value: string) => void
  onCredsBlur: () => void
}) {
  const [manualMode, setManualMode] = useState(false)
  const pickable = catalog.options ?? []
  const known = pickable.some((option) => option.id === value)
  const manual = manualMode || !catalog.options || !known
  return (
    <div className="setting">
      <label>{label}</label>
      {catalog.options ? (
        <>
          <select
            className="text-input"
            aria-label={ariaLabel}
            value={manualMode || !known ? '' : value}
            onChange={(event) => {
              const next = event.target.value
              if (next === '') {
                setManualMode(true)
                return
              }
              setManualMode(false)
              onCommit(next)
            }}
          >
            <option value="">手动填写…</option>
            {!known && value ? <option value={value}>当前：{value}</option> : null}
            {pickable.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          {manual ? (
            <input
              className="text-input"
              autoCapitalize="off"
              spellCheck={false}
              placeholder={placeholder}
              aria-label={`${ariaLabel}（手动）`}
              value={value}
              onChange={(event) => onCommit(event.target.value)}
              onBlur={() => onCredsBlur()}
            />
          ) : null}
        </>
      ) : (
        <input
          className="text-input"
          autoCapitalize="off"
          spellCheck={false}
          placeholder={placeholder}
          aria-label={ariaLabel}
          value={value}
          onChange={(event) => onCommit(event.target.value)}
          onBlur={() => onCredsBlur()}
        />
      )}
      {catalog.busy ? <p className="field-hint">正在拉取列表…</p> : null}
      {catalog.error ? (
        <p className="field-hint">
          {catalog.error}
          <button className="link-btn" type="button" onClick={() => void catalog.refresh()}>
            再试一次
          </button>
        </p>
      ) : null}
      {!catalog.busy && !catalog.error ? <p className="field-hint">{hint}</p> : null}
    </div>
  )
}

/** Fields for the OpenAI-compatible cloud provider. */
export function CloudFields({ config, patch }: Props) {
  const [models, setModels] = useState<CatalogOption[] | null>(null)
  const [modelBusy, setModelBusy] = useState(false)
  const [modelError, setModelError] = useState<string | null>(null)
  const refreshModels = useCallback(async (override?: Partial<TtsConfig>) => {
    const next = { ...config, ...override }
    next.cloudKey = cleanSecret(next.cloudKey)
    if (!next.cloudBaseUrl.trim() || !next.cloudKey) return
    setModelBusy(true)
    setModelError(null)
    try {
      const ids = await listCloudModels(next)
      setModels(ids.map((id) => ({ id, label: id })))
    } catch (error) {
      setModels(null)
      setModelError(error instanceof Error ? error.message : '模型列表没有拉下来')
    } finally {
      setModelBusy(false)
    }
  }, [config])

  const presets = cloudVoicePresets(config.cloudBaseUrl, config.cloudModel)
  const modelCatalog: Catalog = { options: models, busy: modelBusy, error: modelError, refresh: refreshModels }
  const voiceCatalog: Catalog = {
    options: presets,
    busy: false,
    error: null,
    refresh: refreshModels,
  }

  return (
    <>
      <div className="setting">
        <label>接口地址</label>
        <input
          className="text-input"
          type="url"
          inputMode="url"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="https://api.siliconflow.cn/v1"
          aria-label="云端朗读接口地址"
          value={config.cloudBaseUrl}
          onChange={(event) => patch({ cloudBaseUrl: event.target.value })}
          onBlur={(event) => {
            const cloudBaseUrl = event.currentTarget.value.trim()
            patch({ cloudBaseUrl })
            void refreshModels({ cloudBaseUrl })
          }}
        />
        <p className="field-hint">填到 /v1 即可。地址和密钥都填好后，模型和声音会自动变成下拉选择。</p>
      </div>
      <div className="setting">
        <label>接口密钥</label>
        <input
          className="text-input secret-input"
          type="text"
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          aria-label="云端朗读接口密钥"
          value={config.cloudKey}
          onChange={(event) => patch({ cloudKey: event.target.value })}
          onBlur={(event) => {
            const cloudKey = cleanSecret(event.currentTarget.value)
            patch({ cloudKey })
            void refreshModels({ cloudKey })
          }}
        />
        <p className="field-hint">密钥只存在这台设备的 Lumi 里。</p>
      </div>
      <CatalogField
        label="模型"
        ariaLabel="云端朗读模型"
        value={config.cloudModel}
        catalog={modelCatalog}
        placeholder="FunAudioLLM/CosyVoice2-0.5B"
        hint="识别不出下拉就手动填，效果一样。"
        onCommit={(value) => patch({ cloudModel: value })}
        onCredsBlur={refreshModels}
      />
      <CatalogField
        label="声音"
        ariaLabel="云端朗读声音"
        value={config.cloudVoice}
        catalog={voiceCatalog}
        placeholder="alloy"
        hint="认识的服务给预设音色（硅基会拼上模型前缀），不认识就手动填。"
        onCommit={(value) => patch({ cloudVoice: value })}
        onCredsBlur={refreshModels}
      />
      <div className="setting">
        <label>朗读语气</label>
        <textarea
          className="text-input voice-instructions"
          rows={3}
          aria-label="云端朗读语气"
          value={config.cloudInstructions}
          onChange={(event) => patch({ cloudInstructions: event.target.value })}
        />
        <p className="field-hint">例如：像讲故事一样，语速平稳，句间留一点呼吸。</p>
      </div>
    </>
  )
}

/** Fields for DeepSeek's speech tool: one key and its two voices. */
export function DeepSeekFields({ config, patch }: Props) {
  return (
    <>
      <div className="setting">
        <label>DeepSeek 密钥</label>
        <input
          className="text-input secret-input"
          type="text"
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          aria-label="DeepSeek 朗读密钥"
          value={config.deepseekKey}
          onChange={(event) => patch({ deepseekKey: event.target.value })}
          onBlur={(event) => {
            const deepseekKey = cleanSecret(event.currentTarget.value)
            patch({ deepseekKey })
          }}
        />
        <p className="field-hint">在 DeepSeek 开放平台建一个 API Key。密钥只存在这台设备的 Lumi 里。</p>
      </div>
      <div className="setting">
        <label>DeepSeek 声音</label>
        <select
          className="text-input"
          aria-label="DeepSeek 朗读声音"
          value={config.deepseekVoice}
          onChange={(event) => patch({ deepseekVoice: event.target.value })}
        >
          <option value="stella">Stella · 女声</option>
          <option value="tide">Tide · 男声</option>
        </select>
        <p className="field-hint">
          中文、粤语、英文、日文、韩文按句子自动识别，不用选语言。倍速在手机上播放时调，服务本身不支持变速。
        </p>
      </div>
    </>
  )
}

/** Fields for Azure Speech: region, key, and a neural voice catalog. */
export function AzureFields({ config, patch }: Props) {
  const [voices, setVoices] = useState<CatalogOption[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const refresh = useCallback(async (override?: Partial<TtsConfig>) => {
    const next = { ...config, ...override }
    next.azureKey = cleanSecret(next.azureKey)
    if (!next.azureRegion.trim() || !next.azureKey) return
    setBusy(true)
    setError(null)
    try {
      setVoices(await listAzureVoices(next))
    } catch (err) {
      setVoices(null)
      setError(err instanceof Error ? err.message : '声音列表没有拉下来')
    } finally {
      setBusy(false)
    }
  }, [config])
  const catalog: Catalog = { options: voices, busy, error, refresh }

  return (
    <>
      <div className="setting">
        <label>Azure 区域</label>
        <input
          className="text-input"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="eastasia"
          aria-label="Azure 朗读区域"
          value={config.azureRegion}
          onChange={(event) => patch({ azureRegion: event.target.value })}
          onBlur={() => void refresh()}
        />
        <p className="field-hint">填区域名（如 eastasia）。区域和密钥填好后，声音会自动变成下拉选择。</p>
      </div>
      <div className="setting">
        <label>Azure 密钥</label>
        <input
          className="text-input secret-input"
          type="text"
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          aria-label="Azure 朗读密钥"
          value={config.azureKey}
          onChange={(event) => patch({ azureKey: event.target.value })}
          onBlur={(event) => {
            const azureKey = cleanSecret(event.currentTarget.value)
            patch({ azureKey })
            void refresh({ azureKey })
          }}
        />
        <p className="field-hint">语音服务的密钥，只存在这台设备的 Lumi 里。</p>
      </div>
      <CatalogField
        label="Azure 声音"
        ariaLabel="Azure 朗读声音"
        value={config.azureVoice}
        catalog={catalog}
        placeholder="zh-CN-XiaoxiaoNeural"
        hint="中文声音排前面。拉取失败就手动填声音短名。"
        onCommit={(value) => patch({ azureVoice: value })}
        onCredsBlur={refresh}
      />
    </>
  )
}
