export const onRequest: PagesFunction = async (context) => {
    const url = new URL(context.request.url)
    const target = `https://clawhost-prod.firebaseapp.com${url.pathname}${url.search}`
    return fetch(target, {
        method: context.request.method,
        headers: context.request.headers
    })
}