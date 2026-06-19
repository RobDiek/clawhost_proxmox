/**
 * Shared page classification for SEO services. Two distinct concepts:
 *
 *  - isSystemPage  — BROAD. Pages that must never get CONTENT EXPANSION
 *    (page-refresh): cart/checkout/account, shop/blog indexes, thank-you,
 *    contact, accessibility, privacy, terms, homepage. They may still deserve a
 *    meta description (e.g. contact), so this is NOT used to gate meta/schema.
 *
 *  - isFunctionalPage — NARROW. Transactional / post-action pages that should be
 *    noindex and are NOT worth optimizing at all (cart, checkout, my-account,
 *    order-received/summary, thank-you, wishlist). Used to skip meta + schema
 *    generation. Deliberately does NOT match contact/about/privacy/terms — those
 *    are real pages that should keep their meta description.
 */

// ── Broad: content-expansion exclusion ──────────────────────────────────────
const SYSTEM_SLUG = /^(cart|checkout|my-account|account|shop|store|thank-?you|order-received|wishlist|login|log-in|register|lost-password|basket|wc-|sample-page|blog|home|homepage|front-page)$/i
const SYSTEM_TITLE = /סל קניות|עגלת קניות|סיכום רכישה|תשלום|קופה|החשבון שלי|התחבר|הרשמ|נגישות|צור קשר|צרו קשר|יצירת קשר|מדיניות פרטיות|פרטיות|תקנון|תנאי שימוש|תודה|דף הבית|^בלוג$|^חנות$/
const FUNCTIONAL_SHORTCODE = /\[(woocommerce_|product[s_]|add_to_cart|sale_products|featured_products|contact-form-7|wpforms|gravityform|ninja_form|cart|checkout|my_account|account)/i

// ── Narrow: transactional / no-index pages (skip meta + schema entirely) ─────
const FUNCTIONAL_SLUG = /^(cart|checkout|my-account|account|order-received|order-pay|view-order|wishlist|lost-password|basket|wc-)$/i
const FUNCTIONAL_TITLE = /סל קניות|עגלת קניות|סיכום רכישה|^\s*תשלום\s*$|^\s*קופה\s*$|החשבון שלי|הזמנה התקבלה|^\s*תודה|רשימת משאלות/
const FUNCTIONAL_SHORTCODE_TX = /\[(woocommerce_cart|woocommerce_checkout|woocommerce_my_account|woocommerce_order_tracking|cart|checkout|my_account)/i

function slugOf(link: string): string {
    try { return decodeURIComponent((link.match(/\/([^/]+)\/?$/)?.[1] || '')).toLowerCase() } catch { return '' }
}

/** Broad — must never get content expansion. */
export function isSystemPage(link: string, title: string, content?: string): boolean {
    if (SYSTEM_SLUG.test(slugOf(link))) return true
    if (SYSTEM_TITLE.test((title || '').trim())) return true
    if (content && FUNCTIONAL_SHORTCODE.test(content)) return true
    return false
}

/** Narrow — transactional/no-index pages to skip for meta + schema. */
export function isFunctionalPage(link: string, title: string, content?: string): boolean {
    if (FUNCTIONAL_SLUG.test(slugOf(link))) return true
    if (FUNCTIONAL_TITLE.test((title || '').trim())) return true
    if (content && FUNCTIONAL_SHORTCODE_TX.test(content)) return true
    return false
}