import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'

/**
 * Computes the SHA-256 content hash of a file using a read stream,
 * so large model files are never fully loaded into memory.
 */
export function hashFile(absolutePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(absolutePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

export function hashBuffer(content: Uint8Array | string): string {
  return createHash('sha256').update(content).digest('hex')
}
