import fs from 'node:fs'
import path from 'node:path'
import { Buffer } from 'node:buffer'

function argFor(argv, flag) {
  const index = argv.indexOf(flag)
  if (-1 === index) {
    throw new Error(`Missing required argument ${flag}`)
  }
  return argv[index + 1]
}

// The collection holds no pm.test assertions and only successful calls (it's for manual calls;
// error cases are tested in Mocha), so each request's expected status is the spec's declared
// success code for the endpoint it's mapped to in sync-manifest.json.
function expectedStatusByName(manifest, generatedDir) {
  const byName = new Map()
  for (const [key, name] of Object.entries(manifest)) {
    const skeletonPath = path.join(generatedDir, `${key}.json`)
    if (!fs.existsSync(skeletonPath)) {
      continue
    }
    const skeleton = JSON.parse(fs.readFileSync(skeletonPath, 'utf8'))
    if (skeleton._meta?.successStatus) {
      byName.set(name, skeleton._meta.successStatus)
    }
  }
  return byName
}

// Every endpoint of this API answers in JSON, so any response that carries a body must be JSON —
// an HTML error page or plain text means the request hit something other than the API. Bodiless
// responses (e.g. 204 from Delete) are skipped, even though they still send a JSON Content-Type.
function nonJsonBodyProblem(response) {
  const body = Buffer.from(response.stream?.data ?? []).toString('utf8')
  if ('' === body) {
    return null
  }
  const contentType =
    response.header?.find((header) => 'content-type' === header.key.toLowerCase())?.value ?? ''
  if (!contentType.includes('application/json')) {
    return `Content-Type is "${contentType || 'missing'}", not JSON`
  }
  try {
    JSON.parse(body)
    return null
  } catch {
    return 'body is not valid JSON'
  }
}

function decodeUrlPart(part) {
  try {
    return decodeURIComponent(part)
  } catch {
    return part
  }
}

// newman reports the request as actually sent, i.e. after variable substitution — so a
// "{{name}}" left in it means the variable was never set (e.g. Delete run without Create first).
// URL parts come URL-encoded ("%7B%7Btodo_id%7D%7D"), so they're decoded before matching.
function unresolvedVariables(request) {
  const url = request.url ?? {}
  const urlParts = [
    ...(url.host ?? []),
    ...(url.path ?? []),
    ...(url.query ?? []).filter((param) => !param.disabled).map((param) => param.value ?? ''),
  ].map(decodeUrlPart)
  const parts = [
    ...urlParts,
    ...(request.header ?? []).filter((header) => !header.disabled).map((header) => header.value),
    request.body?.raw ?? '',
  ]
  const found = parts.join(' ').match(/\{\{[^}]+\}\}/g) ?? []
  return [...new Set(found)].map((variable) => `\`${variable}\``)
}

function main() {
  const argv = process.argv.slice(2)
  const resultsPath = argFor(argv, '--results')
  const generatedDir = argFor(argv, '--generated')
  const manifestPath = argFor(argv, '--manifest')
  const outPath = argFor(argv, '--out')

  const report = JSON.parse(fs.readFileSync(resultsPath, 'utf8'))
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  const byName = expectedStatusByName(manifest, generatedDir)

  const rows = report.run.executions.map((execution) => {
    const name = execution.item.name
    const expected = byName.get(name) ?? null
    const actual = execution.response?.code ?? null
    const problems = []
    if (null === actual) {
      problems.push('no response')
    } else {
      if (null === expected) {
        // A request the spec has no success code for doesn't belong in the collection.
        problems.push('not mapped to an endpoint in sync-manifest.json')
      } else if (actual !== expected) {
        problems.push(`expected ${expected}, got ${actual}`)
      }
      const jsonProblem = nonJsonBodyProblem(execution.response)
      if (jsonProblem) {
        problems.push(jsonProblem)
      }
    }
    const unresolved = unresolvedVariables(execution.request)
    if (unresolved.length > 0) {
      problems.push(`unresolved ${unresolved.join(', ')} (variable not set by an earlier request?)`)
    }

    const result = problems.length > 0 ? `❌ ${problems.join('; ')}` : '✅'
    return { name, expected, actual, result, failed: problems.length > 0 }
  })

  // Script errors (e.g. a pre-request that throws) and any failed pm.test land in run.failures.
  const scriptFailures = report.run.failures ?? []
  const failedCount = rows.filter((row) => row.failed).length + scriptFailures.length

  const lines = [
    `## Collection run: ${0 === failedCount ? '✅ passed' : `❌ ${failedCount} failed`}`,
    '',
    `Ran against a live local instance: ${rows.length} request(s). Each request is checked for: the success status code from the OpenAPI spec, a JSON body whenever it has one, and no unresolved \`{{variables}}\`.`,
    '',
    '| Request | Expected | Actual | Result |',
    '| --- | --- | --- | --- |',
    ...rows.map(
      (row) => `| ${row.name} | ${row.expected ?? '—'} | ${row.actual ?? '—'} | ${row.result} |`
    ),
  ]

  if (scriptFailures.length > 0) {
    lines.push('', 'Errors:', '')
    scriptFailures.forEach((failure) => {
      const name = failure.source?.name ?? 'unknown request'
      const message = failure.error?.message ?? 'unknown error'
      lines.push(`- **${name}**: ${message}`)
    })
  }

  fs.writeFileSync(outPath, `${lines.join('\n')}\n`)
  console.log(`Wrote collection run summary to ${outPath} (${failedCount} failure(s))`)

  if (failedCount > 0) {
    process.exitCode = 1
  }
}

main()
