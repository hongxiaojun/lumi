import type { Prefs } from '../types'
import { FONTS, THEMES } from '../lib/styles'
import { userFontId } from '../lib/userFonts'
import type { UserFontChoice } from './UserFontsPanel'

type Props = {
  prefs: Prefs
  userFonts?: UserFontChoice[]
  parallel: boolean
  onChange: (prefs: Prefs) => void
  onParallel: (on: boolean) => void
  onEngine: () => void
  onVoice: () => void
  onClose: () => void
}

export function SettingsPanel({
  prefs, userFonts = [], parallel, onChange, onParallel, onEngine, onVoice, onClose,
}: Props) {
  return (
    <div className="sheet" onClick={(e) => e.stopPropagation()}>
      <header className="panel-head">
        <h3>阅读设置</h3>
        <button className="icon-btn" onClick={onClose}>完成</button>
      </header>
      <div className="setting">
        <label>字体</label>
        <p className="field-hint">添加自己的字体、并用于全部书，回到书架点「我的字体」。这里点一款字体只改当前这本书。</p>
        <div className="chips">
          {FONTS.map((f) => (
            <button
              key={f.id}
              className={`chip ${prefs.font === f.id ? 'on' : ''}`}
              onClick={() => onChange({ ...prefs, font: f.id })}
            >
              {f.name}
            </button>
          ))}
          {userFonts.map((font) => {
            const id = userFontId(font.id)
            return (
              <button
                key={id}
                className={`chip ${prefs.font === id ? 'on' : ''}`}
                onClick={() => onChange({ ...prefs, font: id })}
              >
                {font.name}
              </button>
            )
          })}
        </div>
      </div>
      <div className="setting">
        <label>字号 {prefs.fontSize}</label>
        <input
          className="range"
          type="range"
          min={16}
          max={28}
          value={prefs.fontSize}
          onChange={(e) => onChange({ ...prefs, fontSize: Number(e.target.value) })}
        />
      </div>
      <div className="setting">
        <label>行距 {prefs.lineHeight.toFixed(1)}</label>
        <input
          className="range"
          type="range"
          min={16}
          max={24}
          value={Math.round(prefs.lineHeight * 10)}
          onChange={(e) => onChange({ ...prefs, lineHeight: Number(e.target.value) / 10 })}
        />
      </div>
      <div className="setting">
        <label>纸色</label>
        <div className="swatches">
          {THEMES.map((t) => (
            <button
              key={t.id}
              className={`swatch-wrap ${prefs.theme === t.id ? 'on' : ''}`}
              onClick={() => onChange({ ...prefs, theme: t.id })}
            >
              <span className="swatch" style={{ background: t.bg, color: t.fg }} />
              <span className="swatch-name">{t.name}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="setting">
        <label>对照翻译</label>
        <p className="field-hint">全英文书打开即对照；中文等其他语言默认关闭。这里可以随时切换。</p>
        <div className="chips">
          <button
            className={`chip ${parallel ? 'on' : ''}`}
            aria-pressed={parallel}
            onClick={() => onParallel(true)}
          >
            开
          </button>
          <button
            className={`chip ${parallel ? '' : 'on'}`}
            aria-pressed={!parallel}
            onClick={() => onParallel(false)}
          >
            关
          </button>
        </div>
      </div>
      <div className="setting">
        <label>翻译引擎</label>
        <div className="chips">
          <button className="chip" onClick={onEngine}>选择引擎</button>
        </div>
      </div>
      <div className="setting">
        <label>翻页</label>
        <div className="chips">
          <button
            className={`chip ${prefs.flow === 'paginated' ? 'on' : ''}`}
            onClick={() => onChange({ ...prefs, flow: 'paginated' })}
          >
            仿真翻页
          </button>
          <button
            className={`chip ${prefs.flow === 'scrolled' ? 'on' : ''}`}
            onClick={() => onChange({ ...prefs, flow: 'scrolled' })}
          >
            滚动
          </button>
        </div>
      </div>
      <div className="setting">
        <label>朗读语音</label>
        <p className="field-hint">选系统语音，或接一个兼容 OpenAI /audio/speech 的云端声音。语速、语气和听书排版都在里面。</p>
        <div className="chips">
          <button className="chip" type="button" onClick={onVoice}>声音与语速</button>
        </div>
      </div>
      <div className="setting">
        <label>朗读时专注</label>
        <p className="field-hint">默认关闭。只在大声朗读时，让当前段以外的段落退后。当前段的对照仍清楚。</p>
        <div className="chips">
          <button
            className={`chip ${prefs.focusRead ? 'on' : ''}`}
            aria-pressed={prefs.focusRead}
            onClick={() => onChange({ ...prefs, focusRead: true })}
          >
            开
          </button>
          <button
            className={`chip ${prefs.focusRead ? '' : 'on'}`}
            aria-pressed={!prefs.focusRead}
            onClick={() => onChange({ ...prefs, focusRead: false })}
          >
            关
          </button>
        </div>
      </div>
    </div>
  )
}
