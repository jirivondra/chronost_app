import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildUrl } from './build-url.js'

function argFor(argv, flag) {
  const index = argv.indexOf(flag)
  if (-1 === index) {
    throw new Error(`Missing required argument ${flag}`)
  }
  return argv[index + 1]
}

// Script modules store their text as `\n...\n` template literals for readability;
// strip the surrounding blank lines so the Postman "exec" array matches what was written.
function buildEvent(listen, scriptText) {
  const trimmed = scriptText.replace(/^\n/, '').replace(/\n$/, '')
  return {
    listen,
    script: {
      exec: trimmed.split('\n'),
      type: 'text/javascript',
      packages: {},
      requests: {},
    },
  }
}

async function loadScript(scriptsDir, key) {
  const scriptPath = path.join(scriptsDir, `${key}.js`)
  if (!fs.existsSync(scriptPath)) {
    return null
  }
  return import(pathToFileURL(scriptPath).href)
}

// The spec's response examples (e.g. "Successful Response" with the Todo example body), saved on
// the request so Postman shows what the endpoint returns. Their originalRequest URL is rebuilt with
// this collection's host/path convention, same as the request itself.
function buildResponses(skeleton, currentUrl) {
  return (skeleton.response || []).map((response) => {
    const originalRequest = response.originalRequest || {}
    const hasBody = originalRequest.body && Object.keys(originalRequest.body).length > 0
    return {
      name: response.name,
      originalRequest: {
        method: originalRequest.method ?? skeleton.request.method,
        header: originalRequest.header ?? [],
        ...(hasBody ? { body: originalRequest.body } : {}),
        url: buildUrl(
          currentUrl,
          originalRequest.url?.path ?? skeleton.request.url.path,
          originalRequest.url?.query,
          skeleton._meta?.queryParamsWithExample
        ),
      },
      status: response.status,
      code: response.code,
      _postman_previewlanguage: response._postman_previewlanguage,
      header: response.header ?? [],
      cookie: [],
      body: response.body ?? '',
    }
  })
}

function walkAndSync(items, reverseManifest, generatedDir, scriptModules, warnings) {
  for (const item of items) {
    if (item.item) {
      walkAndSync(item.item, reverseManifest, generatedDir, scriptModules, warnings)
      continue
    }

    const key = reverseManifest.get(item.name)
    if (!key) {
      continue
    }

    const skeletonPath = path.join(generatedDir, `${key}.json`)
    if (!fs.existsSync(skeletonPath)) {
      warnings.push(
        `Manifest maps "${item.name}" to "${key}", but no generated skeleton exists for it ` +
          '(removed from the spec?) — left untouched.'
      )
      continue
    }

    const skeleton = JSON.parse(fs.readFileSync(skeletonPath, 'utf8'))
    item.request.method = skeleton.request.method
    item.request.url = buildUrl(
      item.request.url,
      skeleton.request.url.path,
      skeleton.request.url.query,
      skeleton._meta?.queryParamsWithExample
    )

    const events = []
    const scriptModule = scriptModules.get(key)
    if (scriptModule?.prerequest) {
      events.push(buildEvent('prerequest', scriptModule.prerequest))
    }
    if (scriptModule?.test) {
      events.push(buildEvent('test', scriptModule.test))
    }
    // Only write `event` when there's a script — an empty array on every script-less request was
    // pure diff noise in each sync PR.
    if (events.length > 0) {
      item.event = events
    } else {
      delete item.event
    }

    item.response = buildResponses(skeleton, item.request.url)
  }
}

async function main() {
  const argv = process.argv.slice(2)
  const generatedDir = argFor(argv, '--generated')
  const scriptsDir = argFor(argv, '--scripts')
  const manifestPath = argFor(argv, '--manifest')
  const currentPath = argFor(argv, '--current')
  const outPath = argFor(argv, '--out')

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  const reverseManifest = new Map(Object.entries(manifest).map(([key, name]) => [name, key]))
  const collection = JSON.parse(fs.readFileSync(currentPath, 'utf8'))

  const scriptModules = new Map()
  for (const key of Object.keys(manifest)) {
    const scriptModule = await loadScript(scriptsDir, key)
    if (scriptModule) {
      scriptModules.set(key, scriptModule)
    }
  }

  const warnings = []
  walkAndSync(collection.item, reverseManifest, generatedDir, scriptModules, warnings)
  warnings.forEach((warning) => console.warn(warning))

  fs.writeFileSync(outPath, `${JSON.stringify(collection, null, 2)}\n`)
  console.log(`Wrote synced collection to ${outPath}`)
}

main()
