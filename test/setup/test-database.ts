import { URL, fileURLToPath } from 'node:url'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import * as schema from '../../src/infra/drizzle/schema'

type TestDatabase = ReturnType<typeof drizzle<typeof schema>>

type TestDatabaseContext = {
  readonly container: StartedPostgreSqlContainer
  readonly connectionString: string
  readonly db: TestDatabase
  readonly sqlClient: ReturnType<typeof postgres>
}

type DatabaseTable = {
  readonly tableSchema: string
  readonly tableName: string
}

let containerInstance: StartedPostgreSqlContainer | null = null

const migrationsDirectory = fileURLToPath(new URL('../../drizzle', import.meta.url))

const startContainer = async (): Promise<StartedPostgreSqlContainer> => {
  if (containerInstance) {
    return containerInstance
  }

  const container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('test_db')
    .withUsername('test_user')
    .withPassword('test_password')
    .start()

  containerInstance = container
  return container
}

const stopContainer = async (): Promise<void> => {
  if (containerInstance) {
    await containerInstance.stop()
    containerInstance = null
  }
}

const createTestDatabase = async (): Promise<TestDatabaseContext> => {
  const container = await startContainer()
  const connectionString = container.getConnectionUri()

  const sqlClient = postgres(connectionString, {
    max: 5,
    fetch_types: false,
  })

  const db = drizzle(sqlClient, { schema })

  return {
    container,
    connectionString,
    db,
    sqlClient,
  }
}

const pushSchema = async (db: TestDatabase): Promise<void> => {
  await migrate(db, { migrationsFolder: migrationsDirectory })
}

const quoteIdentifier = (identifier: string): string => `"${identifier.replaceAll('"', '""')}"`

const getPublicTables = async (db: TestDatabase): Promise<readonly DatabaseTable[]> => {
  return db.execute<DatabaseTable>(sql`
    SELECT table_schema AS "tableSchema", table_name AS "tableName"
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
    ORDER BY table_schema, table_name
  `)
}

const truncateAllTables = async (db: TestDatabase): Promise<void> => {
  const tables = await getPublicTables(db)

  if (tables.length === 0) {
    return
  }

  const tableReferences = tables
    .map(
      ({ tableSchema, tableName }) =>
        `${quoteIdentifier(tableSchema)}.${quoteIdentifier(tableName)}`,
    )
    .join(', ')

  await db.execute(sql.raw(`TRUNCATE TABLE ${tableReferences} RESTART IDENTITY CASCADE`))
}

const closeConnection = async (sqlClient: ReturnType<typeof postgres>): Promise<void> => {
  await sqlClient.end()
}

export {
  startContainer,
  stopContainer,
  createTestDatabase,
  pushSchema,
  truncateAllTables,
  closeConnection,
  type TestDatabase,
  type TestDatabaseContext,
}
