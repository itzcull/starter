import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vite-plus/test'
import { server } from '@test-utils/msw-server'

describe('MSW integration test support', () => {
  it('intercepts third-party HTTP calls made with fetch', async () => {
    server.use(
      http.get('https://third-party.example.test/users/:userId', ({ params }) => {
        return HttpResponse.json({ id: params.userId, name: 'Test User' })
      }),
    )

    const response = await fetch('https://third-party.example.test/users/user_123')

    await expect(response.json()).resolves.toEqual({
      id: 'user_123',
      name: 'Test User',
    })
  })
})
