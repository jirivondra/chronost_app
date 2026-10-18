import fs from 'node:fs'
import path from 'node:path'
import { convert } from 'openapi-to-postmanv2'
import { canonicalKey } from './canonical-key.js'

function argFor(argv, flag) {
  const index = argv.indexOf(flag)
  if (-1 === index) {
    throw new Error(`Missing required argument ${flag}`)
  }
  return argv[index + 1]
}

function collectRequests(items, out) {
  for (const item of items) {
    if (item.item) {
      collectRequests(item.item, out)
    } else if (item.request) {
      out.push(item)
    }
  }
}

// OpenAPI path params are "{name}"; canonicalKey expects the ":name" convention used elsewhere.
function specPathSegments(specPath) {
  return specPath
    .split('/')
    .filter(Boolean)
    .map((segment) => (segment.startsWith('{') ? `:${segment.slice(1, -1)}` : segment))
}

function successStatus(operation) {
  const code = Object.keys(operation.responses || {}).find(
    (status) => !status.startsWith('4') && !status.startsWith('5')
  )
  return code ? Number(code) : null
}

// Maps each endpoint's canonical key to its declared success status code (e.g. 201 for Create,
// 204 for Delete), read directly from the spec rather than guessed — this drives the minimal
// status-code check summarize-newman.js runs against the collection run's results.
function successStatusByKey(spec) {
  const byKey = {}
  for (const [specPath, methods] of Object.entries(spec.paths || {})) {
    for (const [method, operation] of Object.entries(methods)) {
      const key = canonicalKey(method, specPathSegments(specPath))
      byKey[key] = successStatus(operation)
    }
  }
  return byKey
}

function hasExample(param) {
  return (
    param.example !== undefined ||
    param.schema?.example !== undefined ||
    Boolean(param.examples && Object.keys(param.examples).length > 0)
  )
}

// Maps each endpoint's canonical key to which of its query parameters have a spec-declared
// example (vs. openapi-to-postmanv2 falling back to a bare type-name value like "string" when
// none exists) — build-url.js uses this to decide which query params to add enabled vs. disabled
// on a freshly generated request, so an unresolved/placeholder value never gets sent silently.
function queryParamsByKey(spec) {
  const byKey = {}
  for (const [specPath, methods] of Object.entries(spec.paths || {})) {
    for (const [method, operation] of Object.entries(methods)) {
      const key = canonicalKey(method, specPathSegments(specPath))
      const queryParams = (operation.parameters || []).filter((param) => param.in === 'query')
      byKey[key] = Object.fromEntries(queryParams.map((param) => [param.name, hasExample(param)]))
    }
  }
  return byKey
}

function main() {
  const argv = process.argv.slice(2)
  const specPath = argFor(argv, '--spec')
  const outDir = argFor(argv, '--out')
  const specData = fs.readFileSync(specPath, 'utf8')
  const parsedSpec = JSON.parse(specData)
  const statusByKey = successStatusByKey(parsedSpec)
  const queryParamsByKeyMap = queryParamsByKey(parsedSpec)

  // Prefer the OpenAPI schema `example` (set via Pydantic model_config in api/main.py) over
  // generic type placeholders like "<string>", so a freshly wired-up request is directly usable.
  const options = {
    requestParametersResolution: 'example',
    exampleParametersResolution: 'example',
  }

  convert({ type: 'string', data: specData }, options, (err, result) => {
    if (err) {
      console.error(err)
      process.exit(1)
    }
    if (!result.result) {
      console.error(result.reason)
      process.exit(1)
    }

    const requests = []
    collectRequests(result.output[0].data.item, requests)

    fs.mkdirSync(outDir, { recursive: true })
    for (const request of requests) {
      const key = canonicalKey(request.request.method, request.request.url.path)
      const skeleton = {
        ...request,
        _meta: {
          successStatus: statusByKey[key] ?? null,
          queryParamsWithExample: queryParamsByKeyMap[key] ?? {},
        },
      }
      fs.writeFileSync(path.join(outDir, `${key}.json`), JSON.stringify(skeleton, null, 2))
    }

    console.log(`Generated ${requests.length} request skeleton(s) into ${outDir}`)
  })
}

main()
