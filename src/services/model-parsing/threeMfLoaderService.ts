import { Mesh, Group, ObjectLoader } from 'three'
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js'
import { ModelParseError } from './modelScene'
import type { ModelScene } from './modelScene'
import ParseWorker from './threeMfParser.worker?worker'

/**
 * Loads 3MF content into the normalized ModelScene representation using
 * the Three.js ThreeMFLoader. Basic material/color information from the
 * package is preserved by the loader. Unsupported 3MF features are
 * reported by the loader as console warnings, never as fatal errors.
 *
 * Requires a DOM context (renderer process or jsdom) because the loader
 * parses model XML with DOMParser.
 *
 * @throws ModelParseError when the content cannot be loaded as 3MF.
 */
export function loadThreeMfScene(content: ArrayBuffer | Uint8Array): ModelScene {
  let root: Group
  try {
    root = new ThreeMFLoader().parse(toArrayBuffer(content))
  } catch (error) {
    throw new ModelParseError('Failed to parse 3MF file', error)
  }

  let meshCount = 0
  root.traverse((object) => {
    if (object instanceof Mesh) {
      meshCount += 1
    }
  })
  if (meshCount === 0) {
    throw new ModelParseError('3MF file contains no mesh geometry')
  }

  root.name = root.name || '3mf-model'
  return { root, source: '3mf' }
}

/**
 * Parses 3MF content asynchronously in a background Web Worker.
 *
 * @throws ModelParseError when the content cannot be loaded as 3MF.
 */
export function loadThreeMfSceneAsync(content: ArrayBuffer | Uint8Array): Promise<ModelScene> {
  return new Promise((resolve, reject) => {
    const worker = new ParseWorker()
    const arrayBuffer = toArrayBuffer(content)

    worker.onmessage = (event) => {
      const data = event.data
      worker.terminate()
      if (data.success) {
        try {
          const root = new ObjectLoader().parse(data.json) as Group
          root.name = root.name || '3mf-model'
          resolve({ root, source: '3mf' })
        } catch (error) {
          reject(new ModelParseError('Failed to reconstruct 3D scene from worker data', error))
        }
      } else {
        reject(new ModelParseError(data.error || 'Failed to parse 3MF in worker'))
      }
    }

    worker.onerror = (error) => {
      worker.terminate()
      reject(new ModelParseError('Worker error during 3MF parsing', error))
    }

    worker.postMessage({ content: arrayBuffer }, [arrayBuffer])
  })
}

function toArrayBuffer(content: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (content instanceof ArrayBuffer) {
    return content
  }
  return content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength) as ArrayBuffer
}
