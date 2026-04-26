import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '@/db/schema'

const createDb = () => {
    const sql = postgres(process.env.DATABASE_URL!)
    return drizzle(sql, { schema })
}

let instance: ReturnType<typeof createDb>

export const db = new Proxy({} as ReturnType<typeof createDb>, {
    get(_, prop) {
        if (!instance) instance = createDb()
        return Reflect.get(instance, prop)
    }
})