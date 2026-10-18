import fs from 'node:fs'
import path from 'node:path'

function argFor(argv, flag) {
  const index = argv.indexOf(flag)
  if (-1 === index) {
    throw new Error(`Missing required argument ${flag}`)
  }
  return argv[index + 1]
}

// The collection itself holds no pm.test assertions (it's for manual calls only), so the expected
// status code of each request comes from outside the collection: the spec's declared success code
// for manifest-mapped requests, or a "(404)"-style suffix in the request name for hand-maintained
// ones such as the Errors folder. Requests matching neither are reported but not checked.
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

function expectedStatus(name, byName) {
  if (byName.has(name)) {
    return byName.get(name)
  }
  const suffix = name.match(/\((\d{3})\)\s*$/)
  return suffix ? Number(suffix[1]) : null
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
    const expected = expectedStatus(name, byName)
    const actual = execution.response?.code ?? null
    let result = '➖ not checked'
    if (null === actual) {
      result = '❌ no response'
    } else if (null !== expected) {
      result = actual === expected ? '✅' : '❌'
    }
    return { name, expected, actual, result, failed: result.startsWith('❌') }
  })

  // Script errors (e.g. a pre-request that throws) and any failed pm.test land in run.failures.
  const scriptFailures = report.run.failures ?? []
  const failedCount = rows.filter((row) => row.failed).length + scriptFailures.length

  const lines = [
    `## Collection run: ${0 === failedCount ? '✅ passed' : `❌ ${failedCount} failed`}`,
    '',
    `Ran against a live local instance: ${rows.length} request(s). Status codes are checked against the OpenAPI spec (or the "(NNN)" suffix of the request name).`,
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
