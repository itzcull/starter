import type { TestProject } from 'vitest/node'
import { closeConnection, createTestDatabase, pushSchema, stopContainer } from './test-database'

declare module 'vitest' {
  export interface ProvidedContext {
    testDatabaseConnectionString: string
  }
}

export const setup = async ({ provide }: TestProject): Promise<void> => {
  console.log('\n[Global Setup] Starting PostgreSQL container...')

  const { connectionString, db, sqlClient } = await createTestDatabase()

  console.log('[Global Setup] Pushing schema to test database...')
  await pushSchema(db)

  await closeConnection(sqlClient)

  provide('testDatabaseConnectionString', connectionString)

  console.log('[Global Setup] PostgreSQL container ready\n')
}

export const teardown = async (): Promise<void> => {
  console.log('\n[Global Teardown] Stopping PostgreSQL container...')
  await stopContainer()
  console.log('[Global Teardown] Container stopped\n')
}
