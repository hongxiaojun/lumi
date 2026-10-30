import { useRef } from 'react'
import { userFontId } from '../lib/userFonts'

export type UserFontChoice = {
  id: string
  name: string
}

type Props = {
  fonts: UserFontChoice[]
  activeFont: string
  notice: string | null
  onAdd: (files: File[]) => void
  onApply: (id: string) => void
  onRemove: (id: string) => void
  onClose: () => void
}

export function UserFontsPanel({
  fonts,
  activeFont,
  notice,
  onAdd,
  onApply,
  onRemove,
  onClose,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div className="font-layer" onClick={onClose}>
      <div
        className="font-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-font-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="user-font-title">我的字体</h3>
        <p className="font-hint">
          字体文件只留在这台 Mac 的 Lumi 里，不会放进安装包。用于全部书会换掉每本书的字体，字号和纸色不动。
        </p>
        {notice ? (
          <p className="font-notice" role="alert">
            {notice}
          </p>
        ) : null}
        {fonts.length === 0 ? <p className="font-hint">还没有添加字体。</p> : null}
        <ul className="font-list">
          {fonts.map((font) => {
            const active = activeFont === userFontId(font.id)
            return (
              <li className="font-row" key={font.id}>
                <span className="name">{font.name}</span>
                <button
                  className={active ? 'btn' : 'btn primary'}
                  type="button"
                  disabled={active}
                  aria-pressed={active}
                  onClick={() => onApply(font.id)}
                >
                  {active ? '正在使用' : '用于全部书'}
                </button>
                <button type="button" className="btn" onClick={() => onRemove(font.id)} aria-label={`移除${font.name}`}>
                  移除
                </button>
              </li>
            )
          })}
        </ul>
        <div className="font-actions">
          <button className="btn primary" type="button" onClick={() => inputRef.current?.click()}>
            添加字体
          </button>
          <button className="btn" type="button" onClick={onClose}>
            完成
          </button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2"
          multiple
          hidden
          onChange={(event) => {
            const list = event.target.files
            if (list && list.length > 0) onAdd([...list])
            event.target.value = ''
          }}
        />
      </div>
    </div>
  )
}
