// This collection addresses the host via literal variable placeholders baked into the path
// segments (e.g. "{{todo_id}}"), not Postman's ":param" path-variable feature, and the host
// array is a single "{{protocol}}{{host}}{{port}}" placeholder — not a real hostname. Only the
// path *segments* are spec-derived; host/raw prefix always comes from an existing request, so
// the result never depends on a "baseUrl" environment variable this collection doesn't define.
//
// Query params come from the skeleton too. A param only gets added enabled — and into the raw
// query string — if the spec declared an example for it (queryParamsWithExample, from
// generate.js). Without one, openapi-to-postmanv2 fills the value with a bare type name (e.g.
// "string"), so leaving it enabled would silently send that placeholder; instead it's added
// disabled, same convention as hand-maintained runtime-only params like `cursor` on Get Next
// Page (see chronos_postman_colection's README, "Query Parameters Without Example Data").
// The param's spec description is carried over too, so a new/changed filter on an existing
// endpoint shows up documented in Postman, not just as a bare key.
export function buildUrl(
  currentUrl,
  skeletonPathSegments,
  skeletonQuery = [],
  queryParamsWithExample = {}
) {
  const path = skeletonPathSegments.map((segment) =>
    segment.startsWith(':') ? `{{${segment.slice(1)}}}` : segment
  )
  const hostPrefix = currentUrl.host.join('')
  const query = skeletonQuery.map((param) => ({
    key: param.key,
    value: param.value,
    disabled: !queryParamsWithExample[param.key],
    ...(param.description ? { description: param.description } : {}),
  }))
  const queryString = query
    .filter((param) => !param.disabled)
    .map((param) => `${param.key}=${param.value}`)
    .join('&')
  const raw = `${hostPrefix}/${path.join('/')}${queryString ? `?${queryString}` : ''}`
  return query.length > 0
    ? { raw, host: currentUrl.host, path, query }
    : { raw, host: currentUrl.host, path }
}
