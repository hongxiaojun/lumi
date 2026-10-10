import type { Prefs } from '../types'
import { FONTS, THEMES } from '../lib/styles'

type Props = {
  prefs: Prefs
  onChange: (prefs: Prefs) => void
  onClose: () => void
}

export function SettingsPanel({ prefs, onChange, onClose }: Props) {
  return (
    <div className="sheet" onClick={(e) => e.stopPropagation()}>
      <h3>阅读设置</h3>
      <div className="setting">
        <label>字体</label>
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
        <p className="field-hint">全英文书打开即对照；中文等其他语言默认关闭。阅读页可随时切换。</p>
      </div>
      <div className="setting">
        <label>翻页</label>
        <div className="chips">
          <button
            className={`chip ${prefs.flow === 'paginated' ? 'on' : ''}`}
            onClick={() => onChange({ ...prefs, flow: 'paginated' })}
          >
            分页
          </button>
          <button
            className={`chip ${prefs.flow === 'scrolled' ? 'on' : ''}`}
            onClick={() => onChange({ ...prefs, flow: 'scrolled' })}
          >
            滚动
          </button>
        </div>
      </div>
      <div className="chrome-row" style={{ justifyContent: 'space-between' }}>
        <button className="icon-btn" onClick={onClose}>
          完成
        </button>
      </div>
    </div>
  )
}
