import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import type { DiscoveredFile } from '@/types/modelFile'
import { DEFAULT_IGNORED_DIRECTORIES, getSupportedExtension, isHiddenName } from './supportedFiles'

export class ScanCancelledError extends Error {
  constructor() {
    super('Directory scan was cancelled')
    this.name = 'ScanCancelledError'
  }
}

export type ScanOptions = {
  /** Abort to cancel a long-running scan. */
  signal?: AbortSignal
  /** Called for every supported file found, with the running total. */
  onFile?: (file: DiscoveredFile, scannedCount: number) => void
  /** Directory names to skip (defaults to DEFAULT_IGNORED_DIRECTORIES). */
  ignoredDirectories?: ReadonlySet<string>
}

/**
 * Recursively scans a directory for supported model files (.stl/.3mf,
 * case-insensitive). Hidden directories and common dependency/build folders
 * are skipped. Results are sorted by relative path so output is deterministic.
 */
export async function scanDirectory(
  rootDirectory: string,
  options: ScanOptions = {},
): Promise<DiscoveredFile[]> {
  const ignored = options.ignoredDirectories ?? DEFAULT_IGNORED_DIRECTORIES
  const results: DiscoveredFile[] = []

  const walk = async (currentDirectory: string): Promise<void> => {
    if (options.signal?.aborted) {
      throw new ScanCancelledError()
    }

    const entries = await readdir(currentDirectory, { withFileTypes: true })
    entries.sort((a, b) => compareCodepoints(a.name, b.name))

    for (const entry of entries) {
      if (options.signal?.aborted) {
        throw new ScanCancelledError()
      }

      const absolutePath = path.join(currentDirectory, entry.name)

      if (entry.isDirectory()) {
        if (isHiddenName(entry.name) || ignored.has(entry.name.toLowerCase())) {
          continue
        }
        await walk(absolutePath)
        continue
      }

      if (!entry.isFile()) {
        continue
      }

      const extension = getSupportedExtension(entry.name)
      if (!extension) {
        continue
      }

      const stats = await stat(absolutePath)
      const file: DiscoveredFile = {
        absolutePath,
        relativePath: path.relative(rootDirectory, absolutePath),
        filename: entry.name,
        extension,
        sizeBytes: stats.size,
        modifiedAt: stats.mtime.toISOString(),
      }
      results.push(file)
      options.onFile?.(file, results.length)
    }
  }

  await walk(path.resolve(rootDirectory))
  results.sort((a, b) => compareCodepoints(a.relativePath, b.relativePath))
  return results
}

/** Locale-independent ordering so scan output is deterministic on any machine. */
function compareCodepoints(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
