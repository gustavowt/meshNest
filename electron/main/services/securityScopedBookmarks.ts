import { promises as fs } from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

/**
 * Mac App Store sandbox support. When the app runs as a sandboxed Mac App
 * Store build, it can only reach files the user explicitly selected, and that
 * access is lost on the next launch unless it is re-established from a
 * security-scoped bookmark.
 *
 * Outside the sandbox (dev, direct Developer ID builds) all of these helpers
 * are no-ops, so the normal filesystem path is unchanged.
 */
const isSandboxed = process.mas === true

/** directoryPath -> base64 security-scoped bookmark for that directory tree. */
type BookmarkMap = Record<string, string>

let cache: BookmarkMap | null = null

function bookmarksFilePath(): string {
  return path.join(app.getPath('userData'), 'security-bookmarks.json')
}

async function loadBookmarks(): Promise<BookmarkMap> {
  if (cache) {
    return cache
  }
  try {
    const raw = await fs.readFile(bookmarksFilePath(), 'utf8')
    cache = JSON.parse(raw) as BookmarkMap
  } catch {
    cache = {}
  }
  return cache
}

async function saveBookmarks(map: BookmarkMap): Promise<void> {
  cache = map
  await fs.writeFile(bookmarksFilePath(), JSON.stringify(map), 'utf8')
}

/**
 * Persists the security-scoped bookmark captured when the user picked a
 * directory, keyed by that directory's path. No-op outside the sandbox.
 */
export async function storeDirectoryBookmark(
  directory: string,
  bookmark: string | undefined,
): Promise<void> {
  if (!isSandboxed || !bookmark) {
    return
  }
  const map = await loadBookmarks()
  map[directory] = bookmark
  await saveBookmarks(map)
}

/** Finds the stored bookmark for the nearest ancestor directory of `target`. */
async function findBookmarkFor(target: string): Promise<string | undefined> {
  const map = await loadBookmarks()
  let best: string | undefined
  let bestLength = -1
  for (const [directory, bookmark] of Object.entries(map)) {
    const prefix = directory.endsWith(path.sep) ? directory : `${directory}${path.sep}`
    const covers = target === directory || target.startsWith(prefix)
    if (covers && directory.length > bestLength) {
      best = bookmark
      bestLength = directory.length
    }
  }
  return best
}

/**
 * Runs `fn` while holding security-scoped access to the directory that contains
 * `target`. Outside the sandbox (or when no bookmark is stored) it simply runs
 * `fn`, so the in-session access granted by the open panel keeps working.
 */
export async function withSecurityScopedAccess<T>(
  target: string,
  fn: () => Promise<T>,
): Promise<T> {
  if (!isSandboxed) {
    return fn()
  }
  const bookmark = await findBookmarkFor(target)
  if (!bookmark) {
    return fn()
  }
  const stopAccessing = app.startAccessingSecurityScopedResource(bookmark)
  try {
    return await fn()
  } finally {
    if (typeof stopAccessing === 'function') {
      stopAccessing()
    }
  }
}
