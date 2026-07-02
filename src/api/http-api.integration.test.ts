import { describe, expect, it } from 'vite-plus/test'
import { httpApi } from './http-api'

describe('HTTP API integration surface', () => {
  it('serves the OpenAPI document from the real API module', async () => {
    const response = await httpApi.request('/doc')
    const document = (await response.json()) as { readonly info: { readonly title: string } }

    expect(response.status).toBe(200)
    expect(document.info.title).toBe('Starter HTTP API')
  })
})
