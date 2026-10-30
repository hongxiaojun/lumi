import { useEffect, useRef, useState } from 'react'
import 'foliate-js/view.js'
import { Overlayer } from 'foliate-js/overlayer.js'
import type { FlowId, Prefs, RelocateDetail, TocItem, TranslatorConfig } from '../types'
import type { Annotation, NoteColor } from '../lib/notes'
import type { ScriptKind } from '../lib/translate/lang'
import { colorHex, createAnnotation } from '../lib/notes'
import { bindMarginTap, tapClaims, tapPage, tapPlace } from '../lib/pageTap'
import { readerCSS } from '../lib/styles'
import { mountUserFonts } from '../lib/userFonts'
import { loadFontFaces } from '../lib/fonts'
import { readingFontFaces, subscribeUserFontFaces } from '../lib/userFonts'
import { languageFromMeta, prepareSection, shouldTypesetEnglish } from '../lib/typeset'
import { blocksFromDoc, injectTranslations, listenBookSelection, removeTranslations } from '../lib/readerDom'
import { rangeMenuPoint, sectionIndexForRange } from '../lib/annotate'
import { SelectionBar } from './SelectionBar'
import { attachPager } from '../lib/pager'
import { searchAcceptNode } from '../lib/searchHits'
import { explainImportFailure } from '../lib/importError'
import { contextForRange, paintStoredHighlights } from '../lib/anchor'
import { resolveDirection } from '../lib/translate/lang'
import { translateBlocks, translateTexts } from '../lib/translate/service'
import { capBlocks, nextLinearIndexes } from '../lib/translate/prefetch'
import { appendReadAloud, bindReadAloud, blocksForSources, bookClickGate, keepReadAloud, readAloudLang, readAloudSources, retargetReadAloud } from '../lib/readAloud'
import { rememberChapter } from '../lib/edgeChapter'
import { SPREAD_PAGE_PX, spreadColumns } from '../lib/spread'
import { PAGE_MARGIN_PX, layoutFoot, paintPageFeet, type FootLabel } from '../lib/pageFoot'

export type ReaderApi = {
  goLeft: () => void
  goRight: () => void
  goTo: (href: string) => void
  goToFraction: (n: number) => void
  search: (query: string) => AsyncIterable<unknown>
  clearSearch: () => void
  toc: TocItem[]
}

type FoliateViewEl = HTMLElement & {
  book: {
    toc?: TocItem[]
    metadata?: { language?: unknown }
    sections?: Array<{ linear?: string; size?: number; createDocument?: () => Promise<Document> }>
  }
  renderer?: {
    setAttribute: (name: string, value: string) => void
    getAttribute: (name: string) => string | null
    feet?: HTMLElement[] | null
    page?: number
    pages?: number
    render?: () => void
    setStyles?: (css: string) => void
    getContents?: () => {
      doc: Document
      index: number
      overlayer?: {
        add: (key: string, range: Range, draw: typeof Overlayer.highlight, options: { color: string; opacity?: number }) => void
        remove: (key: string) => void
        redraw: () => void
      }
    }[]
    scrollToAnchor?: (anchor: Range) => Promise<void>
    addEventListener: HTMLElement['addEventListener']
  }
  lastLocation?: RelocateDetail
  open: (file: File | Blob) => Promise<void>
  init: (opts: { lastLocation?: string; showTextStart?: boolean }) => Promise<void>
  goTo: (target: string | number) => Promise<void>
  goToFraction: (n: number) => Promise<void>
  goLeft: () => Promise<void>
  goRight: () => Promise<void>
  next: () => Promise<void>
  prev: () => Promise<void>
  search: (opts: { query: string; acceptNode?: (node: Node) => number }) => AsyncIterable<unknown>
  clearSearch: () => void
  close: () => void
  addAnnotation: (a: { value: string; color?: string }) => Promise<unknown>
  deleteAnnotation: (a: { value: string }) => Promise<unknown>
  getCFI: (index: number, range: Range) => string
}

type Props = {
  file: Blob
  cfi: string | null
  bookId: string
  language?: ScriptKind
  prefs: Prefs
  translator: TranslatorConfig
  annotations: Annotation[]
  onRelocate: (detail: RelocateDetail) => void
  onReady: (api: ReaderApi) => void
  onCreateAnnotation: (row: Annotation) => void
  onRequestNote: (row: Annotation) => void
  onStatus: (msg: string | null) => void
  onOpenFailed: (msg: string) => void
  onUpdateAnnotation: (row: Annotation) => void
  onPageFoot?: (line: FootLabel | null) => void
}

function applyLayout(view: FoliateViewEl, flow: FlowId, css: string, width: number, height: number) {
  const r = view.renderer
  if (!r) return
  const columns = spreadColumns(width, height, flow)
  r.setAttribute('flow', flow)
  r.setAttribute('max-column-count', String(columns))
  r.setAttribute('max-inline-size', `${SPREAD_PAGE_PX}px`)
  r.setAttribute('gap', '8%')
  r.setAttribute('margin', `${PAGE_MARGIN_PX}px`)
  r.setStyles?.(css)
  r.render?.()
  const docs = (r.getContents?.() ?? []).map((item) => item.doc)
  void Promise.all(docs.map((doc) => mountUserFonts(doc))).then((loaded) => {
    if (loaded.some(Boolean)) r.render?.()
  })
}

function showPageFoot(view: FoliateViewEl, flow: FlowId, sectionFraction: number): FootLabel | null {
  const sizes = (view.book?.sections ?? []).map((section) =>
    section.linear !== 'no' && (section.size ?? 0) > 0 ? section.size ?? 0 : 0)
  const labels = layoutFoot({
    flow,
    columns: view.renderer?.feet?.length ?? 1,
    page: view.renderer?.page ?? 0,
    pages: view.renderer?.pages ?? 0,
    sectionSizes: sizes,
    index: view.lastLocation?.section?.current ?? 0,
    locationCurrent: view.lastLocation?.location?.current ?? 0,
    locationTotal: view.lastLocation?.location?.total ?? 0,
    sectionFraction,
  })
  if (flow === 'paginated' && view.renderer?.feet?.length) {
    paintPageFeet(view.renderer.feet, labels)
    return null
  }
  paintPageFeet(view.renderer?.feet, null)
  const line = labels?.[0]
  return line?.page ? line : null
}

function speechMark(
  rects: Parameters<typeof Overlayer.highlight>[0],
  options: { color?: string; opacity?: number },
) {
  const drawn = Overlayer.highlight(rects, options)
  drawn.style.opacity = String(options.opacity ?? 0.74)
  return drawn
}

function readAloudPage(view: FoliateViewEl, doc: Document) {
  const contents = view.renderer?.getContents?.() ?? []
  const slot = contents.find((item) => item.doc === doc && item.overlayer)
    ?? contents.find((item) => item.overlayer)
  const overlayer = slot?.overlayer
  const renderer = view.renderer
  if (!overlayer || !renderer?.scrollToAnchor) return null
  return {
    add(key: string, range: Range, color: string, opacity: number) {
      overlayer.add(key, range, speechMark, { color, opacity })
    },
    remove(key: string) {
      overlayer.remove(key)
    },
    redraw() {
      overlayer.redraw()
    },
    scrollTo(range: Range) {
      // scrollToAnchor selects the sentence in the book. Edge is reading the
      // light-DOM article, so that selection is cleared as soon as the page lands.
      const clear = () => range.startContainer.ownerDocument?.getSelection()?.removeAllRanges()
      return Promise.resolve(renderer.scrollToAnchor?.(range)).then(clear, clear)
    },
  }
}

export function FoliateHost({
  file, cfi, bookId, language, prefs, translator, annotations,
  onRelocate, onReady, onCreateAnnotation, onRequestNote, onStatus, onOpenFailed, onUpdateAnnotation,
  onPageFoot,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<FoliateViewEl | null>(null)
  const prefsRef = useRef(prefs)
  const translatorRef = useRef(translator)
  const bookIdRef = useRef(bookId)
  const annotationsRef = useRef(annotations)
  const onRelocateRef = useRef(onRelocate)
  const onReadyRef = useRef(onReady)
  const onCreateRef = useRef(onCreateAnnotation)
  const onNoteRef = useRef(onRequestNote)
  const onStatusRef = useRef(onStatus)
  const onOpenFailedRef = useRef(onOpenFailed)
  const onUpdateRef = useRef(onUpdateAnnotation)
  const onPageFootRef = useRef(onPageFoot)
  const startCfi = useRef(cfi)
  const scriptRef = useRef<ScriptKind>(language ?? 'zh')
  const languageRef = useRef(language)
  const fontFaces = useRef('')
  const docRef = useRef<Document | null>(null)
  const replaySpeechRef = useRef<(() => void) | null>(null)
  const sectionFrac = useRef(0)
  const pending = useRef<{ range: Range; text: string } | null>(null)
  const lastPen = useRef<NoteColor>('yellow')
  const [menu, setMenu] = useState<{ top: number; left: number } | null>(null)
  const commitRef = useRef<(action: 'highlight' | 'note' | 'translate', color?: NoteColor) => void>(() => {})

  useEffect(() => {
    prefsRef.current = prefs
    translatorRef.current = translator
    bookIdRef.current = bookId
    languageRef.current = language
    annotationsRef.current = annotations
    onRelocateRef.current = onRelocate
    onReadyRef.current = onReady
    onCreateRef.current = onCreateAnnotation
    onNoteRef.current = onRequestNote
    onStatusRef.current = onStatus
    onOpenFailedRef.current = onOpenFailed
    onUpdateRef.current = onUpdateAnnotation
    onPageFootRef.current = onPageFoot
  })

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const view = document.createElement('foliate-view') as FoliateViewEl
    host.replaceChildren(view)
    viewRef.current = view
    let gone = false
    const loadDetachers: Array<() => void> = []
    const sessionDetachers: Array<() => void> = []
    let aheadIndex: number | null = null
    let wantAhead = false
    let landFollow = false
    let spokenTicket = 0
    let replaySpeech: (() => void) | null = null
    let followSpeech: (() => boolean) | null = null
    let pageFrame: Element | null = null
    sessionDetachers.push(bindMarginTap(view, {
      frame: () => pageFrame,
      turn: (side) => {
        if (pending.current) return
        void (side === 'left' ? view.goLeft() : view.goRight())
      },
      chrome: () => {
        if (pending.current) return
        window.dispatchEvent(new Event('leaf:toggle-chrome'))
      },
    }))

    const paint = () =>
      paintStoredHighlights(view, annotationsRef.current, (row) => colorHex(row.color), (row) => onUpdateRef.current(row))

    const pairFor = (text: string) =>
      resolveDirection(text, translatorRef.current.direction)

    const warmup = async (index: number) => {
      const section = view.book.sections?.[index]
      if (!section?.createDocument) return
      try {
        const nextDoc = await section.createDocument()
        const blocks = capBlocks(blocksFromDoc(nextDoc))
        if (!blocks.length) return
        const pair = pairFor(blocks.map((b) => b.text).join('\n'))
        await translateBlocks(
          blocks,
          translatorRef.current.engine,
          pair.from,
          pair.to,
          translatorRef.current.secrets,
        )
      } catch {
        // prefetch is best-effort
      }
    }

    const runParallel = async (doc: Document, index: number) => {
      if (!prefsRef.current.parallel) {
        removeTranslations(doc)
        return
      }
      const blocks = capBlocks(blocksFromDoc(doc))
      if (blocks.length === 0) return
      const pair = pairFor(blocks.map((b) => b.text).join('\n'))
      onStatusRef.current('正在翻译本章…')
      try {
        const map = await translateBlocks(
          blocks,
          translatorRef.current.engine,
          pair.from,
          pair.to,
          translatorRef.current.secrets,
        )
        if (gone) return
        injectTranslations(doc, map)
        for (const c of view.renderer?.getContents?.() ?? []) c.overlayer?.redraw()
        onStatusRef.current(null)
        for (const i of nextLinearIndexes(view.book.sections ?? [], index, 1)) void warmup(i)
      } catch (e) {
        onStatusRef.current(e instanceof Error ? e.message : '翻译失败')
      }
    }

    commitRef.current = (action, color) => { void commit(action, color) }
    const commit = async (action: 'highlight' | 'note' | 'translate', color?: NoteColor) => {
      const info = pending.current
      setMenu(null)
      if (!info) return
      const contents = view.renderer?.getContents?.() ?? []
      const idx = sectionIndexForRange(contents, info.range)
      if (idx == null) {
        onStatusRef.current('无法定位这段文字')
        return
      }
      const cfi = view.getCFI(idx, info.range)
      if (action === 'translate') {
        const pair = resolveDirection(info.text, translatorRef.current.direction)
        onStatusRef.current('正在翻译…')
        try {
          const [tr] = await translateTexts(
            translatorRef.current.engine,
            [info.text],
            pair.from,
            pair.to,
            translatorRef.current.secrets,
          )
          const start = info.range.startContainer
          const hostEl = start.nodeType === 1 ? (start as Element) : start.parentElement
          const el = hostEl?.closest('p, li, h1, h2, h3, h4, blockquote')
          if (el) {
            const id = el.getAttribute('data-leaf-id')
            if (id) injectTranslations(docRef.current ?? el.ownerDocument, new Map([[id, tr]]))
            else {
              let slot = [...el.children].find((child) => child.getAttribute('data-leaf-tr'))
              if (!slot) {
                slot = el.ownerDocument.createElement('span')
                slot.className = 'leaf-tr'
                slot.setAttribute('data-leaf-tr', '1')
                el.append(slot)
              }
              slot.textContent = tr
            }
            for (const c of view.renderer?.getContents?.() ?? []) c.overlayer?.redraw()
          }
          onStatusRef.current(null)
        } catch (err) {
          onStatusRef.current(err instanceof Error ? err.message : '翻译失败')
        }
        return
      }
      try {
        const root = info.range.startContainer.ownerDocument?.body
        const around = root ? contextForRange(root, info.range) : { prefix: '', suffix: '' }
        const row = createAnnotation({
          bookId: bookIdRef.current,
          cfi,
          text: info.text,
          color,
          prefix: around.prefix,
          suffix: around.suffix,
        })
        await view.addAnnotation({ value: cfi, color: colorHex(row.color) })
        onCreateRef.current(row)
        if (action === 'note') onNoteRef.current(row)
      } catch (err) {
        onStatusRef.current(err instanceof Error ? err.message : '划线失败')
      }
    }

    const onLoad = (e: Event) => {
      const doc = (e as CustomEvent).detail?.doc as Document | undefined
      if (!doc) return
      docRef.current = doc
      const frame = doc.defaultView?.frameElement
      rememberChapter(doc, frame instanceof HTMLIFrameElement ? frame.src : '')
      scriptRef.current = prepareSection(doc, scriptRef.current)
      const profile = shouldTypesetEnglish(scriptRef.current) ? 'en' : 'zh'
      applyLayout(view, prefsRef.current.flow, readerCSS(prefsRef.current, profile, readingFontFaces(fontFaces.current)), hostRef.current?.clientWidth ?? 0, hostRef.current?.clientHeight ?? 0)
      pending.current = null
      setMenu(null)
      loadDetachers.splice(0).forEach((fn) => fn())
      const spokenRoot = doc.body ?? doc.documentElement
      const sources = spokenRoot ? readAloudSources(spokenRoot) : []
      const lang = readAloudLang(scriptRef.current)
      const blocks = blocksForSources(sources)
      const arriving = wantAhead
      wantAhead = false
      const ticket = ++spokenTicket
      const offset = keepReadAloud(host, blocks, lang)
      replaySpeech = null
      if (offset != null) {
        const article = host.querySelector(':scope > article.read-aloud')
        if (article instanceof HTMLElement) {
          const stop = bindReadAloud(article, sources, doc, () => readAloudPage(view, doc), {
            offset,
            focus: () => prefsRef.current.focusRead === true,
            onPast: () => {
              wantAhead = true
              const here = view.renderer?.getContents?.()[0]?.index
              if (aheadIndex != null && aheadIndex !== here) void view.goTo(aheadIndex)
            },
          })
          replaySpeech = stop.replay
          replaySpeechRef.current = stop.replay
          followSpeech = stop.follow
          if (arriving) landFollow = true
          loadDetachers.push(() => {
            if (replaySpeech === stop.replay) {
              replaySpeech = null
              followSpeech = null
              replaySpeechRef.current = null
            }
            stop()
          })
        }
      }
      const sectionIndex = (e as CustomEvent).detail?.index as number | undefined
      void appendAhead(sectionIndex ?? 0, ticket)
      pageFrame = doc.defaultView?.frameElement instanceof Element ? doc.defaultView.frameElement : null
      const gate = bookClickGate()
      const onDown = (ev: MouseEvent) => { gate.down(pending.current != null, ev.clientX, ev.clientY) }
      const onUp = (ev: MouseEvent) => { gate.up(doc.getSelection()?.toString() ?? '', ev.clientX, ev.clientY) }
      const onClick = (ev: MouseEvent) => {
        if (tapClaims(ev.target) || ev.defaultPrevented) return
        const article = host.querySelector(':scope > article.read-aloud')
        const speaking = article instanceof HTMLElement && article.dataset.leafSpeaking === '1'
        const frame = doc.defaultView?.frameElement
        const place = frame instanceof Element
          ? tapPlace(frame.getBoundingClientRect().left + ev.clientX, frame, tapPage(frame))
          : 'text'
        const action = gate.click(
          speaking,
          doc.getSelection()?.toString() ?? '',
          place,
        )
        if (action === 'note' || action === 'locate' || action === 'stay') return
        if (action === 'left') void view.goLeft()
        else if (action === 'right') void view.goRight()
        else window.dispatchEvent(new Event('leaf:toggle-chrome'))
      }
      doc.addEventListener('mousedown', onDown)
      doc.addEventListener('mouseup', onUp)
      doc.addEventListener('click', onClick)
      loadDetachers.push(() => {
        doc.removeEventListener('mousedown', onDown)
        doc.removeEventListener('mouseup', onUp)
        doc.removeEventListener('click', onClick)
      })
      doc.addEventListener('keydown', (ev) => {
        if (ev.key === 'ArrowLeft' || ev.key === 'PageUp') {
          ev.preventDefault()
          void view.goLeft()
        } else if (ev.key === 'ArrowRight' || ev.key === 'PageDown' || ev.key === ' ') {
          ev.preventDefault()
          void view.goRight()
        } else if (ev.key === 'Escape') {
          window.dispatchEvent(new Event('leaf:toggle-chrome'))
        }
      })
      loadDetachers.push(listenBookSelection(doc, (info) => {
        pending.current = info
        if (!info || !hostRef.current) {
          setMenu(null)
          return
        }
        const hostEl = hostRef.current
        const place = () => {
          if (pending.current !== info || !hostRef.current) return
          setMenu(rangeMenuPoint(info.range, hostEl))
        }
        void retargetReadAloud(
          host,
          sources,
          info.range,
          readAloudLang(scriptRef.current),
          readAloudPage(view, doc),
        ).then(place)
      }))
      loadDetachers.push(attachPager([doc], {
        getFlow: () => prefsRef.current.flow,
        getFraction: () => sectionFrac.current,
        next: () => void view.next(),
        prev: () => void view.prev(),
      }))
      void paint()
      const index = (e as CustomEvent).detail?.index as number | undefined
      void runParallel(doc, index ?? view.renderer?.getContents?.()[0]?.index ?? 0)
    }

    const appendAhead = async (index: number, ticket: number) => {
      const sections = view.book?.sections ?? []
      const lang = readAloudLang(scriptRef.current)
      for (let i = index + 1; i < sections.length && i < index + 8; i += 1) {
        const section = sections[i]
        if (section?.linear === 'no' || !section.createDocument) continue
        let nextDoc: Document
        try {
          nextDoc = await section.createDocument()
        } catch {
          continue
        }
        if (gone || ticket !== spokenTicket) return
        // The open chapter is typeset before it is read aloud. The chapter
        // waiting ahead has to be the same text, or the next page replaces
        // the article and Edge's highlight disappears.
        prepareSection(nextDoc, scriptRef.current)
        const root = nextDoc.body ?? nextDoc.documentElement
        const nextBlocks = root ? blocksForSources(readAloudSources(root)) : []
        const count = nextBlocks.reduce((sum, block) => sum + block.text.length, 0)
        if (count < 40) continue
        aheadIndex = i
        appendReadAloud(host, nextBlocks, lang)
        const here = view.renderer?.getContents?.()[0]?.index
        if (wantAhead && i !== here) void view.goTo(i)
        return
      }
    }

    view.addEventListener('load', onLoad)
    view.addEventListener('relocate', (e: Event) => {
      onRelocateRef.current((e as CustomEvent).detail as RelocateDetail)
      replaySpeech?.()
      // The first relocate can arrive before the new page has an overlayer.
      // Keep trying until the sentence actually scrolls into that page.
      if (landFollow && followSpeech?.()) landFollow = false
    })
    view.addEventListener('draw-annotation', (e: Event) => {
      const { draw, annotation } = (e as CustomEvent).detail as {
        draw: (fn: typeof Overlayer.highlight | typeof Overlayer.outline, opts: { color: string }) => void
        annotation: { color?: string; value?: string }
      }
      if (String(annotation.value ?? '').startsWith('foliate-search:')) {
        draw(Overlayer.outline, { color: '#5a7a96' })
        return
      }
      draw(Overlayer.highlight, { color: annotation.color ?? '#f2c97d' })
    })
    view.addEventListener('create-overlay', () => {
      void paint()
      window.requestAnimationFrame(() => {
        replaySpeech?.()
        if (landFollow && followSpeech?.()) landFollow = false
      })
    })

    void (async () => {
      try {
        fontFaces.current = await loadFontFaces().catch(() => '')
        await view.open(file)
        if (gone) return
        const fromMeta = languageFromMeta(view.book.metadata?.language)
        scriptRef.current = fromMeta ?? languageRef.current ?? 'zh'
        const profile = shouldTypesetEnglish(scriptRef.current) ? 'en' : 'zh'
        applyLayout(view, prefsRef.current.flow, readerCSS(prefsRef.current, profile, readingFontFaces(fontFaces.current)), hostRef.current?.clientWidth ?? 0, hostRef.current?.clientHeight ?? 0)
        view.renderer?.addEventListener('relocate', (ev) => {
          const frac = (ev as CustomEvent).detail?.fraction
          const sectionFraction = typeof frac === 'number' && Number.isFinite(frac) ? frac : sectionFrac.current
          sectionFrac.current = sectionFraction
          onPageFootRef.current?.(showPageFoot(view, prefsRef.current.flow, sectionFraction))
        })
        sessionDetachers.push(attachPager([view], {
          getFlow: () => prefsRef.current.flow,
          getFraction: () => sectionFrac.current,
          next: () => void view.next(),
          prev: () => void view.prev(),
        }))
        if (startCfi.current) await view.init({ lastLocation: startCfi.current })
        else await view.init({ showTextStart: true })
        if (gone) return
        onReadyRef.current({
          goLeft: () => void view.goLeft(),
          goRight: () => void view.goRight(),
          goTo: (href) => void view.goTo(href),
          goToFraction: (n) => void view.goToFraction(n),
          search: (query) => view.search({ query, acceptNode: searchAcceptNode }),
          clearSearch: () => view.clearSearch(),
          toc: view.book?.toc ?? [],
        })
      } catch (error) {
        console.error(error)
        if (!gone) onOpenFailedRef.current(explainImportFailure(error))
      }
    })()

    return () => {
      gone = true
      rememberChapter(null)
      loadDetachers.forEach((fn) => fn())
      sessionDetachers.forEach((fn) => fn())
      try {
        view.close()
      } catch (error) {
        console.error(error)
      }
      view.remove()
      viewRef.current = null
    }
  }, [file])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const apply = () => {
      const renderer = viewRef.current?.renderer
      if (!renderer) return
      const flow = prefsRef.current.flow
      const next = String(spreadColumns(host.clientWidth, host.clientHeight, flow))
      if (renderer.getAttribute('max-column-count') === next) return
      renderer.setAttribute('max-column-count', next)
      renderer.render?.()
    }
    const observer = new ResizeObserver(apply)
    observer.observe(host)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    return subscribeUserFontFaces(() => {
      const view = viewRef.current
      if (!view?.renderer) return
      const profile = shouldTypesetEnglish(scriptRef.current) ? 'en' : 'zh'
      applyLayout(
        view,
        prefsRef.current.flow,
        readerCSS(prefsRef.current, profile, readingFontFaces(fontFaces.current)),
        hostRef.current?.clientWidth ?? 0,
        hostRef.current?.clientHeight ?? 0,
      )
    })
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view?.renderer) return
    const profile = shouldTypesetEnglish(scriptRef.current) ? 'en' : 'zh'
    applyLayout(view, prefs.flow, readerCSS(prefs, profile, readingFontFaces(fontFaces.current)), hostRef.current?.clientWidth ?? 0, hostRef.current?.clientHeight ?? 0)
    replaySpeechRef.current?.()
    let cancelled = false
    const timer = window.setTimeout(() => {
      if (cancelled) return
      const fromRange = view.lastLocation?.range?.startContainer?.ownerDocument
      const doc = fromRange ?? view.renderer?.getContents?.()[0]?.doc ?? docRef.current
      if (!doc) return
      if (!prefs.parallel) {
        removeTranslations(doc)
        return
      }
      const sample = capBlocks(blocksFromDoc(doc))
      if (!sample.length) {
        onStatusRef.current('这一页没有可译的段落')
        return
      }
      const pair = resolveDirection(sample.map((b) => b.text).join('\n'), translator.direction)
      onStatusRef.current('正在翻译本章…')
      void translateBlocks(sample, translator.engine, pair.from, pair.to, translator.secrets)
        .then((map) => {
          if (cancelled) return
          injectTranslations(doc, map)
          for (const c of view.renderer?.getContents?.() ?? []) c.overlayer?.redraw()
          onStatusRef.current(null)
        })
        .catch((e: unknown) => {
          if (!cancelled) onStatusRef.current(e instanceof Error ? e.message : '翻译失败')
        })
    }, 60)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [prefs, translator])

  useEffect(() => {
    const view = viewRef.current
    if (!view?.addAnnotation) return
    void paintStoredHighlights(view, annotations, (row) => colorHex(row.color), (row) => onUpdateRef.current(row))
  }, [annotations])

  return (
    <>
    <div className="reader-stage" ref={hostRef} />
      {menu && (
        <SelectionBar
          top={menu.top}
          left={menu.left}
          onHighlight={(color) => {
            lastPen.current = color
            void commitRef.current('highlight', color)
          }}
          onNote={() => void commitRef.current('note', lastPen.current)}
          onTranslate={() => void commitRef.current('translate')}
        />
      )}
    </>
  )
}
