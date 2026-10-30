import { describe, expect, it } from 'vitest'
import { makeBook } from 'foliate-js/view.js'

const tinyEpub = Uint8Array.from(atob(
  'UEsDBBQAAAAAAAGWT11vYassFAAAABQAAAAIAAAAbWltZXR5cGVhcHBsaWNhdGlvbi9lcHViK3ppcFBLAwQUAAAAAAABlk9d2DW9Zd0AAADdAAAAFgAAAE1FVEEtSU5GL2NvbnRhaW5lci54bWw8P3htbCB2ZXJzaW9uPSIxLjAiPz48Y29udGFpbmVyIHhtbG5zPSJ1cm46b2FzaXM6bmFtZXM6dGM6b3BlbmRvY3VtZW50OnhtbG5zOmNvbnRhaW5lciIgdmVyc2lvbj0iMS4wIj48cm9vdGZpbGVzPjxyb290ZmlsZSBmdWxsLXBhdGg9Ik9FQlBTL2NvbnRlbnQub3BmIiBtZWRpYS10eXBlPSJhcHBsaWNhdGlvbi9vZWJwcy1wYWNrYWdlK3htbCIvPjwvcm9vdGZpbGVzPjwvY29udGFpbmVyPlBLAwQUAAAAAAABlk9dGJDTUpABAACQAQAAEQAAAE9FQlBTL2NvbnRlbnQub3BmPD94bWwgdmVyc2lvbj0iMS4wIj8+PHBhY2thZ2UgeG1sbnM9Imh0dHA6Ly93d3cuaWRwZi5vcmcvMjAwNy9vcGYiIHZlcnNpb249IjIuMCIgdW5pcXVlLWlkZW50aWZpZXI9InVpZCI+PG1ldGFkYXRhIHhtbG5zOmRjPSJodHRwOi8vcHVybC5vcmcvZGMvZWxlbWVudHMvMS4xLyI+PGRjOnRpdGxlPlRpbnk8L2RjOnRpdGxlPjxkYzpsYW5ndWFnZT56aC1DTjwvZGM6bGFuZ3VhZ2U+PGRjOmlkZW50aWZpZXIgaWQ9InVpZCI+dGlueTwvZGM6aWRlbnRpZmllcj48L21ldGFkYXRhPjxtYW5pZmVzdD48aXRlbSBpZD0iYyIgaHJlZj0iYy5odG1sIiBtZWRpYS10eXBlPSJhcHBsaWNhdGlvbi94aHRtbCt4bWwiLz48L21hbmlmZXN0PjxzcGluZT48aXRlbXJlZiBpZHJlZj0iYyIvPjwvc3BpbmU+PC9wYWNrYWdlPlBLAwQUAAAAAAABlk9dV0SsWEgAAABIAAAADAAAAE9FQlBTL2MuaHRtbDxodG1sIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hodG1sIj48Ym9keT48cD5oaTwvcD48L2JvZHk+PC9odG1sPlBLAQIUAxQAAAAAAAGWT11vYassFAAAABQAAAAIAAAAAAAAAAAAAACAAQAAAABtaW1ldHlwZVBLAQIUAxQAAAAAAAGWT13YNb1l3QAAAN0AAAAWAAAAAAAAAAAAAACAAToAAABNRVRBLUlORi9jb250YWluZXIueG1sUEsBAhQDFAAAAAAAAZZPXRiQ01KQAQAAkAEAABEAAAAAAAAAAAAAAIABSwEAAE9FQlBTL2NvbnRlbnQub3BmUEsBAhQDFAAAAAAAAZZPXVdErFhIAAAASAAAAAwAAAAAAAAAAAAAAIABCgMAAE9FQlBTL2MuaHRtbFBLBQYAAAAABAAEAPMAAAB8AwAAAAA=',
), (c) => c.charCodeAt(0))

async function openedTitle(file: Blob): Promise<string> {
  const book = (await makeBook(file)) as { metadata?: { title?: string }; destroy?: () => void }
  try {
    return String(book.metadata?.title ?? '')
  } finally {
    book.destroy?.()
  }
}

describe('reopened zip books', () => {
  it('opens a nameless zip blob as an epub', async () => {
    await expect(openedTitle(new Blob([tinyEpub]))).resolves.toBe('Tiny')
  })

  it('opens an epub File whose type was not set', async () => {
    await expect(openedTitle(new File([tinyEpub], '余华.epub'))).resolves.toBe('Tiny')
  })
})
