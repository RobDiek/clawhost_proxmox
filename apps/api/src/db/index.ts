import { SQL } from 'bun'
import { drizzle } from 'drizzle-orm/bun-sql'
import * as schema from '@/db/schema'

const createDb = () => {
    const client = new SQL(process.env.DATABASE_URL!)
    return drizzle({ client, schema })
}

let instance: ReturnType<typeof createDb>

export const db = new Proxy({} as ReturnType<typeof createDb>, {
    get(_, prop) {
        if (!instance) instance = createDb()
        return Reflect.get(instance, prop)
    }
})