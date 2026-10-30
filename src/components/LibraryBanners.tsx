import { parseCaption } from '../lib/parseGate'
import { ParseBar } from './ParseBar'

type Props = {
  parsePending?: { name: string; fraction: number } | null
  notice?: string | null
  onDismissNotice?: () => void
}

export function LibraryBanners({ parsePending, notice, onDismissNotice }: Props) {
  return (
    <>
      {parsePending ? (
        <div className="parse-banner" role="status">
          <p>
            正在解析《{parsePending.name}》
            {' · '}
            {parseCaption(parsePending.fraction)}
          </p>
          <ParseBar fraction={parsePending.fraction} />
        </div>
      ) : null}
      {notice ? (
        <div className="import-notice" role="alert">
          <p>{notice}</p>
          <button type="button" onClick={onDismissNotice} aria-label="关闭导入提示">
            关闭
          </button>
        </div>
      ) : null}
    </>
  )
}
