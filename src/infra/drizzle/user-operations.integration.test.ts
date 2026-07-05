import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, afterEach, beforeAll, describe, expect, inject, it } from 'vite-plus/test'
import * as schema from '@infra/drizzle/schema'
import { truncateAllTables } from '@test-utils/test-database'
import { createTestSession, createTestUser } from './user-factory'

describe('User database operations', () => {
  let db: ReturnType<typeof drizzle<typeof schema>>
  let sqlClient: ReturnType<typeof postgres>

  beforeAll(() => {
    const connectionString = inject('testDatabaseConnectionString')

    sqlClient = postgres(connectionString, {
      max: 5,
      fetch_types: false,
    })

    db = drizzle(sqlClient, { schema })
  })

  afterEach(async () => {
    await truncateAllTables(db)
  })

  afterAll(async () => {
    await sqlClient.end()
  })

  describe('user creation', () => {
    it('should create a new user', async () => {
      const newUser = createTestUser({
        id: 'user_123',
        name: 'John Doe',
        email: 'john@example.com',
      })

      await db.insert(schema.user).values(newUser)

      const users = await db.select().from(schema.user)

      expect(users).toHaveLength(1)
      expect(users[0]).toMatchObject({
        id: 'user_123',
        name: 'John Doe',
        email: 'john@example.com',
        emailVerified: false,
      })
    })

    it('should enforce unique email constraint', async () => {
      const user1 = createTestUser({
        id: 'user_1',
        email: 'same@example.com',
      })

      const user2 = createTestUser({
        id: 'user_2',
        email: 'same@example.com',
      })

      await db.insert(schema.user).values(user1)

      await expect(db.insert(schema.user).values(user2)).rejects.toThrow()
    })
  })

  describe('user with sessions', () => {
    it('should cascade delete sessions when user is deleted', async () => {
      const userId = 'user_cascade_test'

      const user = createTestUser({
        id: userId,
        email: 'cascade@example.com',
      })

      await db.insert(schema.user).values(user)

      const session = createTestSession({
        id: 'session_1',
        userId,
        token: 'token_123',
      })

      await db.insert(schema.session).values(session)

      const sessionsBefore = await db.select().from(schema.session)
      expect(sessionsBefore).toHaveLength(1)

      await db.delete(schema.user).where(eq(schema.user.id, userId))

      const sessionsAfter = await db.select().from(schema.session)
      expect(sessionsAfter).toHaveLength(0)
    })
  })
})
