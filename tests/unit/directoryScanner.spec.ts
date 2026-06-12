// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { ScanCancelledError, scanDirectory } from '@/services/filesystem/directoryScanner'
import { hashBuffer, hashFile } from '@/services/filesystem/fileHash'
import { getSupportedExtension } from '@/services/filesystem/supportedFiles'

let root: string

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'meshnest-scan-'))
  writeFileSync(join(root, 'a.stl'), 'solid a\nendsolid a\n')
  writeFileSync(join(root, 'B.3MF'), 'zip-bytes')
  writeFileSync(join(root, 'notes.txt'), 'ignore me')
  writeFileSync(join(root, 'photo.png'), 'ignore me too')

  mkdirSync(join(root, 'nested', 'deep'), { recursive: true })
  writeFileSync(join(root, 'nested', 'deep', 'c.STL'), 'solid c\nendsolid c\n')

  mkdirSync(join(root, '.hidden'))
  writeFileSync(join(root, '.hidden', 'hidden.stl'), 'should be skipped')

  mkdirSync(join(root, 'node_modules', 'pkg'), { recursive: true })
  writeFileSync(join(root, 'node_modules', 'pkg', 'dep.stl'), 'should be skipped')

  mkdirSync(join(root, 'dist'))
  writeFileSync(join(root, 'dist', 'built.3mf'), 'should be skipped')
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('supportedFiles', () => {
  test('detects extensions case-insensitively', () => {
    expect(getSupportedExtension('part.stl')).toBe('stl')
    expect(getSupportedExtension('PART.STL')).toBe('stl')
    expect(getSupportedExtension('box.3MF')).toBe('3mf')
    expect(getSupportedExtension('readme.txt')).toBeUndefined()
    expect(getSupportedExtension('no-extension')).toBeUndefined()
    expect(getSupportedExtension('.stl')).toBeUndefined()
  })
})

describe('directoryScanner', () => {
  test('finds STL and 3MF files recursively, skipping hidden and ignored directories', async () => {
    const files = await scanDirectory(root)

    expect(files.map((f) => f.relativePath)).toEqual(['B.3MF', 'a.stl', join('nested', 'deep', 'c.STL')])
    expect(files.map((f) => f.extension)).toEqual(['3mf', 'stl', 'stl'])
    for (const file of files) {
      expect(file.absolutePath.endsWith(file.relativePath)).toBe(true)
      expect(file.sizeBytes).toBeGreaterThan(0)
      expect(new Date(file.modifiedAt).getTime()).not.toBeNaN()
    }
  })

  test('is deterministic across runs', async () => {
    const first = await scanDirectory(root)
    const second = await scanDirectory(root)
    expect(second).toEqual(first)
  })

  test('emits progress for each found file', async () => {
    const progress: Array<{ path: string; count: number }> = []
    await scanDirectory(root, {
      onFile: (file, count) => progress.push({ path: file.relativePath, count }),
    })
    expect(progress).toHaveLength(3)
    expect(progress.map((p) => p.count)).toEqual([1, 2, 3])
  })

  test('supports cancellation through an AbortSignal', async () => {
    const controller = new AbortController()
    await expect(
      scanDirectory(root, {
        signal: controller.signal,
        onFile: () => controller.abort(),
      }),
    ).rejects.toBeInstanceOf(ScanCancelledError)
  })
})

describe('fileHash', () => {
  test('produces a stable sha256 hash for file content', async () => {
    const hash = await hashFile(join(root, 'a.stl'))
    expect(hash).toBe(hashBuffer('solid a\nendsolid a\n'))
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
  })

  test('identical content in different files produces the same hash', async () => {
    const copyPath = join(root, 'a-copy.stl')
    writeFileSync(copyPath, 'solid a\nendsolid a\n')
    try {
      expect(await hashFile(copyPath)).toBe(await hashFile(join(root, 'a.stl')))
    } finally {
      rmSync(copyPath)
    }
  })
})
