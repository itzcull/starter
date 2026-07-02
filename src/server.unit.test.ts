import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import type { createAuth as createAuthAdapter } from '@infra/better-auth/auth-adapter'

const mockAuthHandler = vi.fn<(request: Request) => Promise<Response>>()
const mockCreateAuth = vi.fn<
  (...options: Parameters<typeof createAuthAdapter>) => { handler: typeof mockAuthHandler }
>(() => ({
  handler: mockAuthHandler,
}))

vi.mock('@infra/better-auth/auth-adapter', () => ({
  createAuth: mockCreateAuth,
}))

vi.mock('@tanstack/react-start/server-entry', () => ({
  default: {
    fetch: vi.fn<(request: Request) => Promise<Response>>(),
  },
}))

const importFreshApp = async () => {
  vi.resetModules()
  return import('./server')
}

describe('server routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('auth route delegation', () => {
    it('should route /api/auth requests to the auth handler', async () => {
      const { app } = await importFreshApp()
      const authResponse = new Response('auth response', { status: 200 })
      mockAuthHandler.mockResolvedValueOnce(authResponse)

      const response = await app.request(
        '/api/auth/sign-in',
        {},
        {
          HYPERDRIVE: { connectionString: 'postgres://test' },
          BETTER_AUTH_SECRET: 'test-secret',
        },
      )

      expect(mockCreateAuth).toHaveBeenCalledWith({
        connectionString: 'postgres://test',
        baseUrl: 'http://localhost',
        secret: 'test-secret',
      })
      expect(mockAuthHandler).toHaveBeenCalledOnce()
      expect(response.status).toBe(200)
      expect(await response.text()).toBe('auth response')
    })

    it('should route /api/auth nested paths to the auth handler', async () => {
      const { app } = await importFreshApp()
      const authResponse = new Response('auth callback', { status: 200 })
      mockAuthHandler.mockResolvedValueOnce(authResponse)

      const response = await app.request(
        '/api/auth/callback/github',
        {},
        {
          HYPERDRIVE: { connectionString: 'postgres://test' },
          BETTER_AUTH_SECRET: 'test-secret',
        },
      )

      expect(mockAuthHandler).toHaveBeenCalled()
      expect(await response.text()).toBe('auth callback')
    })
  })

  describe('OpenAPI document', () => {
    it('should serve the generated OpenAPI document from /api/doc', async () => {
      const startHandler = await import('@tanstack/react-start/server-entry')
      const { app } = await importFreshApp()

      const response = await app.request('/api/doc')
      const document = (await response.json()) as { paths: unknown }

      expect(mockCreateAuth).not.toHaveBeenCalled()
      expect(startHandler.default.fetch).not.toHaveBeenCalled()
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('application/json')
      expect(document).toMatchObject({
        openapi: '3.0.0',
        info: {
          title: 'Starter HTTP API',
          version: '0.1.0',
        },
      })
      expect(document.paths).toEqual({})
    })
  })

  describe('TanStack Start fallthrough', () => {
    it('should route non-auth requests to TanStack Start handler', async () => {
      const startHandler = await import('@tanstack/react-start/server-entry')
      const { app } = await importFreshApp()
      const startResponse = new Response('tanstack page', { status: 200 })
      vi.mocked(startHandler.default.fetch).mockResolvedValueOnce(startResponse)

      const response = await app.request('/')

      expect(startHandler.default.fetch).toHaveBeenCalledOnce()
      expect(response.status).toBe(200)
      expect(await response.text()).toBe('tanstack page')
    })

    it('should route non-api paths to TanStack Start handler', async () => {
      const startHandler = await import('@tanstack/react-start/server-entry')
      const { app } = await importFreshApp()
      const startResponse = new Response('about page', { status: 200 })
      vi.mocked(startHandler.default.fetch).mockResolvedValueOnce(startResponse)

      const response = await app.request('/about')

      expect(startHandler.default.fetch).toHaveBeenCalled()
      expect(await response.text()).toBe('about page')
    })

    it('should route unknown api paths to TanStack Start handler', async () => {
      const startHandler = await import('@tanstack/react-start/server-entry')
      const { app } = await importFreshApp()
      const startResponse = new Response('web fallback', { status: 200 })
      vi.mocked(startHandler.default.fetch).mockResolvedValueOnce(startResponse)

      const response = await app.request('/api/not-registered')

      expect(mockCreateAuth).not.toHaveBeenCalled()
      expect(startHandler.default.fetch).toHaveBeenCalledOnce()
      expect(response.status).toBe(200)
      expect(await response.text()).toBe('web fallback')
    })
  })
})
