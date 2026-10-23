#!/usr/bin/env node
/**
 * End-to-end real flow smoke test via Chrome DevTools Protocol (CDP).
 *
 * Exercises the complete real pipeline:
 * 1. Boots Vite dev server (VITEST=1) on port 5173.
 * 2. Boots Electron with --remote-debugging-port=9333 against an isolated pristine user-data-dir.
 * 3. Connects via CDP WebSocket (Node 22 global WebSocket).
 * 4. Configures deterministic mock vision and embedding providers.
 * 5. Runs the REAL indexing pipeline over tests/fixtures/ (generating metadata, renders, descriptions, embeddings).
 * 6. Executes semantic search for "dragon stand".
 * 7. Asserts that result cards render in the DOM with positive match scores.
 * 8. Verifies SQLite database persistence on disk (meshnest.sqlite).
 * 9. Exits with code 0 on success, non-zero on failure.
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const VITE_PORT = 5173
const CDP_PORT = 9333
const FIXTURES_DIR = path.resolve('tests/fixtures')
const VITE_URL = `http://localhost:${VITE_PORT}`
const CDP_LIST_URL = `http://127.0.0.1:${CDP_PORT}/json`

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

class CdpConnection {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl)
    this.nextId = 1
    this.pending = new Map()

    this.ready = new Promise((resolve, reject) => {
      this.ws.onopen = () => resolve()
      this.ws.onerror = (err) => reject(err)
    })

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id)
          this.pending.delete(msg.id)
          if (msg.error) {
            reject(new Error(msg.error.message || JSON.stringify(msg.error)))
          } else {
            resolve(msg.result)
          }
        }
      } catch (err) {
        console.error('CDP parse error:', err)
      }
    }
  }

  send(method, params = {}) {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })
    if (res.exceptionDetails) {
      const desc = res.exceptionDetails.exception?.description || res.exceptionDetails.text
      throw new Error(`CDP evaluation error: ${desc}`)
    }
    return res.result?.value
  }

  close() {
    try {
      this.ws.close()
    } catch {
      // Ignore on cleanup
    }
  }
}

async function waitForHttp(url, timeoutMs = 30000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url)
      if (res.ok) return true
    } catch {
      // not ready yet
    }
    await sleep(300)
  }
  throw new Error(`Timed out waiting for HTTP service at ${url}`)
}

async function getPageTarget(timeoutMs = 30000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(CDP_LIST_URL)
      const targets = await res.json()
      const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
      if (page) return page
    } catch {
      // not ready yet
    }
    await sleep(400)
  }
  throw new Error(`Timed out waiting for CDP page target at ${CDP_LIST_URL}`)
}

async function runSmoke() {
  console.log('--- Starting MeshNest E2E Real Flow Smoke ---')
  console.log(`Fixtures directory: ${FIXTURES_DIR}`)

  const tmpUserData = mkdtempSync(path.join(os.tmpdir(), 'meshnest-e2e-'))
  console.log(`Temporary userData directory: ${tmpUserData}`)

  let viteProc = null
  let electronProc = null
  let cdp = null

  const cleanup = () => {
    if (cdp) {
      cdp.close()
      cdp = null
    }
    if (electronProc) {
      try {
        electronProc.kill('SIGKILL')
      } catch {}
      electronProc = null
    }
    if (viteProc) {
      try {
        viteProc.kill('SIGKILL')
      } catch {}
      viteProc = null
    }
    try {
      rmSync(tmpUserData, { recursive: true, force: true })
    } catch {}
  }

  process.on('SIGINT', () => {
    cleanup()
    process.exit(130)
  })
  process.on('SIGTERM', () => {
    cleanup()
    process.exit(143)
  })

  try {
    // 1. Start Vite dev server in non-Electron mode
    console.log('1. Booting Vite dev server (VITEST=1)...')
    viteProc = spawn('npx', ['vite', '--port', String(VITE_PORT), '--strictPort'], {
      env: { ...process.env, VITEST: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    viteProc.stderr.on('data', (d) => {
      const str = d.toString()
      if (str.includes('error') || str.includes('Error')) {
        console.error('[vite stderr]', str.trim())
      }
    })

    await waitForHttp(VITE_URL, 30000)
    console.log(`   Vite is listening on ${VITE_URL}`)

    // 2. Start Electron
    console.log('2. Booting Electron with remote debugging and isolated user-data...')
    electronProc = spawn(
      'npx',
      [
        'electron',
        '.',
        `--remote-debugging-port=${CDP_PORT}`,
        `--user-data-dir=${tmpUserData}`,
      ],
      {
        env: {
          ...process.env,
          VITE_DEV_SERVER_URL: VITE_URL,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
    electronProc.stderr.on('data', (d) => {
      const str = d.toString()
      if (!str.includes('Bad attribute') && !str.includes('os_crypt')) {
        // filter benign mac GL/crypto noise
        // console.error('[electron stderr]', str.trim())
      }
    })

    // 3. Connect to page via CDP
    console.log('3. Connecting to Electron main window via CDP...')
    const pageTarget = await getPageTarget(30000)
    console.log(`   Target found: "${pageTarget.title}" (${pageTarget.url})`)

    cdp = new CdpConnection(pageTarget.webSocketDebuggerUrl)
    await cdp.ready
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')

    // 4. Wait for window.meshNest bridge to be available
    console.log('4. Waiting for window.meshNest bridge...')
    let bridgeReady = false
    for (let i = 0; i < 60; i++) {
      bridgeReady = await cdp.evaluate(`Boolean(window.meshNest)`)
      if (bridgeReady) break
      await sleep(300)
    }
    if (!bridgeReady) {
      throw new Error('window.meshNest bridge was not injected into the window context')
    }
    console.log('   Bridge is ready!')

    // 5. Configure deterministic mock providers and sync settings
    console.log('5. Configuring mock providers (mock vision + mock embedding, dims=1536)...')
    const setupResult = await cdp.evaluate(
      `(async () => {
        const settings = {
          vision: { provider: 'mock', model: 'mock-vision-1' },
          embedding: { provider: 'mock', model: 'mock-embedding-1', dimensions: 1536 },
          worldSearch: { enabled: true, providers: {} },
          libraryFolder: ${JSON.stringify(FIXTURES_DIR)},
          appearance: 'system',
          language: 'en'
        };
        localStorage.setItem('meshnest.providerSettings.v1', JSON.stringify({ version: 1, settings }));
        await window.meshNest.saveProviderSettings(settings);
        return { ok: true, settings };
      })()`,
    )
    console.log('   Provider settings saved:', JSON.stringify(setupResult.settings.embedding))

    // 6. Run the REAL indexing pipeline over FIXTURES_DIR
    console.log(`6. Executing real indexing pipeline on ${FIXTURES_DIR}...`)
    const indexResult = await cdp.evaluate(
      `(async () => {
        const { useIndexingStore } = await import('/src/stores/indexingStore.ts');
        const indexingStore = useIndexingStore();
        await indexingStore.runIndexing(${JSON.stringify(FIXTURES_DIR)}, { force: true });
        return {
          running: indexingStore.state.running,
          summary: indexingStore.state.summary,
          error: indexingStore.state.error
        };
      })()`,
    )

    console.log('   Indexing summary:', JSON.stringify(indexResult.summary))
    if (!indexResult.summary || indexResult.summary.indexed < 2) {
      throw new Error(`Indexing did not index the expected files. Result: ${JSON.stringify(indexResult)}`)
    }

    // 7. Execute semantic search on Library page
    console.log('7. Running semantic search for "dragon stand" on Library page...')
    await cdp.evaluate(`location.hash = '#/library'`)
    await sleep(500)

    const searchResult = await cdp.evaluate(
      `(async () => {
        const { useLibraryStore } = await import('/src/stores/libraryStore.ts');
        const { useSearchStore } = await import('/src/stores/searchStore.ts');
        const libraryStore = useLibraryStore();
        const searchStore = useSearchStore();

        // 1. Ensure library store is loaded
        await libraryStore.loadLibrary();

        // 2. Set searchbar value and dispatch events so LibraryPage searchQuery updates
        const searchbar = document.querySelector('ion-searchbar');
        if (searchbar) {
          searchbar.value = 'dragon stand';
          const innerInput = searchbar.querySelector('input') || searchbar.shadowRoot?.querySelector('input');
          if (innerInput) {
            innerInput.value = 'dragon stand';
            innerInput.dispatchEvent(new Event('input', { bubbles: true }));
            innerInput.dispatchEvent(new Event('change', { bubbles: true }));
          }
          searchbar.dispatchEvent(new CustomEvent('ionInput', { detail: { value: 'dragon stand' } }));
          searchbar.dispatchEvent(new CustomEvent('ionChange', { detail: { value: 'dragon stand' } }));
        }

        // 3. Also run semantic search directly on searchStore
        await searchStore.runSearch('dragon stand');

        return {
          query: searchStore.state.query,
          count: searchStore.state.results.length,
          loading: searchStore.state.loading,
          error: searchStore.state.error,
          topResults: searchStore.state.results.slice(0, 3).map(r => ({
            filename: r.filename,
            shortName: r.shortName,
            score: r.score,
            distance: r.distance
          }))
        };
      })()`,
    )

    console.log('   Search store result:', JSON.stringify(searchResult))
    if (searchResult.error) {
      throw new Error(`Semantic search returned error: ${searchResult.error}`)
    }
    if (searchResult.count < 1) {
      throw new Error(`Semantic search returned no results for "dragon stand"`)
    }

    // 8. Assert result card rendered in the DOM
    console.log('8. Inspecting DOM for rendered .model-card elements with score badges...')
    await sleep(1000) // allow Vue render cycle to update DOM

    const domCards = await cdp.evaluate(
      `(() => {
        const cards = Array.from(document.querySelectorAll('.model-card'));
        return cards.map(c => ({
          title: c.querySelector('.card-title')?.textContent?.trim() || '',
          subtitle: c.querySelector('.card-subtitle')?.textContent?.trim() || '',
          score: c.querySelector('.score-badge')?.textContent?.trim() || '',
          description: c.querySelector('.file-meta')?.textContent?.trim() || ''
        }));
      })()`,
    )

    console.log('   Rendered DOM cards:', JSON.stringify(domCards))
    if (domCards.length === 0) {
      throw new Error('No .model-card elements found in the DOM after search!')
    }

    const topCard = domCards[0]
    if (!topCard.title.toLowerCase().includes('dragon') && !topCard.subtitle.toLowerCase().includes('dragon')) {
      throw new Error(`Top card does not match expected query: ${JSON.stringify(topCard)}`)
    }
    if (!topCard.score.includes('%')) {
      throw new Error(`Top card score badge is invalid: ${topCard.score}`)
    }
    console.log(`   Top DOM card verified: "${topCard.title}" [${topCard.score}]`)

    // 9. Verify SQLite vector store file on disk
    console.log('9. Verifying SQLite vector database file on disk...')
    const sqlitePath = path.join(tmpUserData, 'meshnest.sqlite')
    if (!existsSync(sqlitePath)) {
      throw new Error(`meshnest.sqlite was not created at ${sqlitePath}`)
    }
    console.log(`   meshnest.sqlite verified on disk at: ${sqlitePath}`)

    console.log('\n=============================================')
    console.log('>>> E2E REAL-FLOW SMOKE: PASSED (exit code 0) <<<')
    console.log('=============================================\n')
    cleanup()
    process.exit(0)
  } catch (err) {
    console.error('\n>>> E2E REAL-FLOW SMOKE: FAILED <<<')
    console.error(err)
    cleanup()
    process.exit(1)
  }
}

runSmoke()
