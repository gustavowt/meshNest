import { writeFileSync, mkdirSync } from 'node:fs'

// Captures real App Store screenshots from the running app over the Chrome
// DevTools Protocol. Run the app first with:
//   npx electron . --remote-debugging-port=9222
// then: node scripts/screenshot.mjs
// Output: screenshots/*.png at 2560x1600 (Apple's retina Mac size).

const PORT = Number(process.env.CDP_PORT || 9222)
const OUT = 'screenshots'
mkdirSync(OUT, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function getPageTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://localhost:${PORT}/json`)
      const targets = await res.json()
      const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
      if (page) return page
    } catch {
      // app not up yet
    }
    await sleep(500)
  }
  throw new Error('No CDP page target found — is Electron running with --remote-debugging-port?')
}

function cdpClient(wsUrl) {
  const ws = new WebSocket(wsUrl)
  let nextId = 1
  const pending = new Map()
  const ready = new Promise((resolve, reject) => {
    ws.onopen = () => resolve()
    ws.onerror = (e) => reject(e)
  })
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) reject(new Error(JSON.stringify(msg.error)))
      else resolve(msg.result)
    }
  }
  const send = (method, params = {}) => {
    const id = nextId++
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params }))
    })
  }
  return { ready, send, ws }
}

async function main() {
  const target = await getPageTarget()
  const client = cdpClient(target.webSocketDebuggerUrl)
  await client.ready
  await client.send('Page.enable')
  await client.send('Runtime.enable')
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 800,
    deviceScaleFactor: 2,
    mobile: false,
  })

  const evaluatePre = async (expression) => {
    const r = await client.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })
    return r.result?.value
  }

  // Persist English through the app's own settings API, then reload so the
  // renderer re-reads it.
  await evaluatePre(
    `(async () => {
       try {
         const s = await window.meshNest.getProviderSettings()
         s.language = 'en'
         await window.meshNest.saveProviderSettings(s)
         return s.language
       } catch (e) { return 'err:' + e.message }
     })()`,
  )
  await client.send('Page.reload')
  await sleep(3500)

  const evaluate = async (expression) => {
    const r = await client.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })
    return r.result?.value
  }

  const shoot = async (name) => {
    const r = await client.send('Page.captureScreenshot', {
      format: 'png',
      clip: { x: 0, y: 0, width: 1280, height: 800, scale: 1 },
      captureBeyondViewport: true,
    })
    writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, 'base64'))
    console.log('saved', `${OUT}/${name}.png`)
  }

  await evaluate(`location.hash = '#/library'`)
  await sleep(3000)
  await shoot('1-library')

  const id = await evaluate(
    `(async () => {
       try {
         const e = await window.meshNest.listLibraryEntries('default')
         const arr = (e || []).filter((x) => x.status === 'indexed')
         const pick =
           arr.find((x) => /organizer/i.test(x.filename)) ||
           arr.find((x) => /washer|vase|fidget/i.test(x.filename)) ||
           arr[0] ||
           (e || [])[0]
         return pick ? pick.id : null
       } catch { return null }
     })()`,
  )
  if (id) {
    await evaluate(`location.hash = '#/models/${id}'`)
    await sleep(4500)
    await shoot('2-detail')
  }

  // Search results live on the library page: drive the hero search bar.
  await evaluate(`location.hash = '#/library'`)
  await sleep(1500)
  await evaluate(
    `(() => {
       const sb = document.querySelector('ion-searchbar')
       if (!sb) return 'no searchbar'
       const q = 'pill organizer'
       sb.value = q
       const input = sb.shadowRoot && sb.shadowRoot.querySelector('input')
       if (input) {
         const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
         setter.call(input, q)
         input.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
       }
       sb.dispatchEvent(new CustomEvent('ionInput', { detail: { value: q }, bubbles: true, composed: true }))
       sb.dispatchEvent(new CustomEvent('ionChange', { detail: { value: q }, bubbles: true, composed: true }))
       return 'ok'
     })()`,
  )
  await sleep(4500)
  await shoot('3-search')

  await evaluate(`location.hash = '#/settings'`)
  await sleep(2000)
  await shoot('4-settings')

  client.ws.close()
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
