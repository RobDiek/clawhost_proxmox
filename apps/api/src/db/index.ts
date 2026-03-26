import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from '@/db/schema'

const createDb = () => {
    const pool = new pg.Pool({
        connectionString: process.env.DATABASE_URL!,
    })
    return drizzle(pool, { schema })
}

let instance: ReturnType<typeof createDb>

export const db = new Proxy({} as ReturnType<typeof createDb>, {
    get(_, prop) {
        if (!instance) instance = createDb()
        return Reflect.get(instance, prop)
    }
})
