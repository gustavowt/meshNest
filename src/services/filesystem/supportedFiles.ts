import { isSupportedModelExtension } from '@/types/modelFile'
import type { SupportedModelExtension } from '@/types/modelFile'

/**
 * Directory names skipped by the scanner in addition to hidden directories.
 */
export const DEFAULT_IGNORED_DIRECTORIES: ReadonlySet<string> = new Set([
  'node_modules',
  'dist',
  'dist-electron',
  'build',
  'out',
  'target',
  'cache',
  '__pycache__',
  'tmp',
  'temp',
])

export function isHiddenName(name: string): boolean {
  return name.startsWith('.')
}

/**
 * Returns the supported model extension for a filename (case-insensitive),
 * or undefined when the file is not a supported model file.
 */
export function getSupportedExtension(filename: string): SupportedModelExtension | undefined {
  const dotIndex = filename.lastIndexOf('.')
  if (dotIndex <= 0 || dotIndex === filename.length - 1) {
    return undefined
  }
  const extension = filename.slice(dotIndex + 1).toLowerCase()
  return isSupportedModelExtension(extension) ? (extension as SupportedModelExtension) : undefined
}
