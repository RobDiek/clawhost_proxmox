/** Offline check: AggregateRating-on-products routes to product_schema, while
 * Organization-level aggregateRating stays on seo.schema. Pure matchers, no DB.
 *   npx tsx src/scripts/verify-routing.ts
 */
import { isProductSchemaTask, isSeoSchemaTask, isAeoCitationMonitorTask, isLlmsTxtTask } from '@/services/monthlyTaskExecutor'

let pass = 0, fail = 0
const T = (over: any) => ({ id: 'x', type: 'website_change', channel: 'seo', title: '', summary: '', actionPlan: [], ...over }) as any
function check(name: string, cond: boolean) { if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}`) } }

// #11 — AggregateRating + Review on products → product_schema (NOT seo.schema)
const t11 = T({ title: 'סכמת AggregateRating + Review ל-48 דפי מוצר שעדיין חסרים' })
check('#11 AggregateRating-on-products → isProductSchemaTask', isProductSchemaTask(t11) === true)
check('#11 → NOT isSeoSchemaTask', isSeoSchemaTask(t11) === false)

// #28 — Organization-level aggregateRating → stays seo.schema (no product word).
// (summary carries the bulk signal isSeoSchemaTask needs, as the real task does.)
const t28 = T({ title: 'סכמת Organization עם רשת sameAs מלאה ו-aggregateRating', summary: 'הטמעה בכל עמודי האתר הקיימים' })
check('#28 Organization aggregateRating → NOT product', isProductSchemaTask(t28) === false)
check('#28 → isSeoSchemaTask', isSeoSchemaTask(t28) === true)

// #22 — genuine Product + Offer → product_schema (regression guard)
const t22 = T({ title: 'הוספת סכמת Offer ל-64 דפי product' })
check('#22 Offer-on-products → isProductSchemaTask', isProductSchemaTask(t22) === true)

// generic Article schema task → seo.schema (regression guard)
const tArt = T({ title: 'הוספת סכמת Article לכל הפוסטים הקיימים' })
check('generic Article schema → seo.schema, not product', isProductSchemaTask(tArt) === false && isSeoSchemaTask(tArt) === true)

// #40/#80 — AI-citation MONITORING → AEO engine, excluded from schema/llms
const t40 = T({ type: 'measurement_gap', title: 'מעקב ציטוט שבועי במנועי AI — 20 prompts × 4 מנועים' })
check('#40 citation-monitor → isAeoCitationMonitorTask', isAeoCitationMonitorTask(t40) === true)
check('#40 → NOT isSeoSchemaTask', isSeoSchemaTask(t40) === false)
check('#40 → NOT isLlmsTxtTask', isLlmsTxtTask(t40) === false)
const t80 = T({ type: 'other', title: 'מעקב חודשי ציטוטים ב-AI · 10 שאלות × 3 מנועים (ChatGPT, Perplexity, Gemini)' })
check('#80 monthly citation-monitor → isAeoCitationMonitorTask', isAeoCitationMonitorTask(t80) === true)
// #28 Organization schema (does llms.txt) must NOT be grabbed as citation-monitor
check('#28 Organization schema → NOT citation-monitor', isAeoCitationMonitorTask(t28) === false)
// generic llms.txt task still routes to llms (regression guard)
const tLlms = T({ title: 'יצירת קובץ llms.txt למנועי AI' })
check('generic llms.txt → isLlmsTxtTask, not citation-monitor', isLlmsTxtTask(tLlms) === true && isAeoCitationMonitorTask(tLlms) === false)

console.log(`\n=== ${pass} passed, ${fail} failed ===`)
process.exit(fail === 0 ? 0 : 1)