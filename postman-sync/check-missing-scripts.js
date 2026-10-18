import fs from 'node:fs'
import path from 'node:path'

function argFor(argv, flag) {
  const index = argv.indexOf(flag)
  if (-1 === index) {
    throw new Error(`Missing required argument ${flag}`)
  }
  return argv[index + 1]
}

function generatedKeys(generatedDir) {
  return fs
    .readdirSync(generatedDir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => file.slice(0, -'.json'.length))
}

function findItemByName(items, name) {
  for (const item of items) {
    if (item.item) {
      const found = findItemByName(item.item, name)
      if (found) {
        return found
      }
    } else if (item.name === name) {
      return item
    }
  }
  return null
}

// Only compares top-level JSON object keys, not values — this flags a field being present or
// absent, not whether its example value still makes sense, which stays a human judgment call.
function bodyFieldKeys(body) {
  if (!body || 'raw' !== body.mode) {
    return null
  }
  try {
    const parsed = JSON.parse(body.raw)
    return 'object' === typeof parsed && !Array.isArray(parsed) ? Object.keys(parsed) : null
  } catch {
    return null
  }
}

// Compares each manifest-mapped request's body against the freshly generated skeleton's body
// (which always reflects every field currently in the spec). This never changes the body itself
// — compose.js deliberately leaves it alone — it only surfaces drift for a human to decide on,
// since a field can be missing on purpose (e.g. a partial-update example).
function findBodyFieldDrift(manifest, generatedDir, collection) {
  const drift = []
  for (const [key, name] of Object.entries(manifest)) {
    const skeletonPath = path.join(generatedDir, `${key}.json`)
    if (!fs.existsSync(skeletonPath)) {
      continue
    }
    const skeleton = JSON.parse(fs.readFileSync(skeletonPath, 'utf8'))
    const specFields = bodyFieldKeys(skeleton.request.body)
    if (!specFields) {
      continue
    }

    const item = findItemByName(collection.item, name)
    if (!item) {
      continue
    }
    const currentFields = bodyFieldKeys(item.request.body) ?? []

    const missing = specFields.filter((field) => !currentFields.includes(field))
    const stale = currentFields.filter((field) => !specFields.includes(field))
    if (missing.length > 0 || stale.length > 0) {
      drift.push({ key, name, missing, stale })
    }
  }
  return drift
}

function main() {
  const argv = process.argv.slice(2)
  const generatedDir = argFor(argv, '--generated')
  const manifestPath = argFor(argv, '--manifest')
  const currentPath = argFor(argv, '--current')
  const outPath = argFor(argv, '--out')

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  const manifestKeys = new Set(Object.keys(manifest))
  const collection = JSON.parse(fs.readFileSync(currentPath, 'utf8'))

  const unwiredEndpoints = generatedKeys(generatedDir).filter((key) => !manifestKeys.has(key))
  const bodyFieldDrift = findBodyFieldDrift(manifest, generatedDir, collection)

  const lines = ['## Postman sync checklist', '']

  if (0 === unwiredEndpoints.length && 0 === bodyFieldDrift.length) {
    lines.push(
      'Nothing to review — every endpoint is wired up and its example body fields match the spec.'
    )
  } else {
    if (unwiredEndpoints.length > 0) {
      lines.push(
        'New endpoints with no request wired up yet (add one to `sync-manifest.json`):',
        ''
      )
      unwiredEndpoints.forEach((key) => lines.push(`- [ ] \`${key}\``))
      lines.push('')
    }
    if (bodyFieldDrift.length > 0) {
      lines.push(
        'Requests whose example body fields no longer match the spec (review and update `body` by hand if not intentional):',
        ''
      )
      bodyFieldDrift.forEach(({ key, name, missing, stale }) => {
        const parts = []
        if (missing.length > 0) {
          parts.push(`missing ${missing.map((field) => `\`${field}\``).join(', ')}`)
        }
        if (stale.length > 0) {
          parts.push(`no longer in spec ${stale.map((field) => `\`${field}\``).join(', ')}`)
        }
        lines.push(`- [ ] \`${key}\` ("${name}"): ${parts.join('; ')}`)
      })
    }
  }

  fs.writeFileSync(outPath, `${lines.join('\n')}\n`)
  console.log(
    `Wrote checklist to ${outPath} (${unwiredEndpoints.length} unwired, ${bodyFieldDrift.length} body field drift)`
  )
}

main()
