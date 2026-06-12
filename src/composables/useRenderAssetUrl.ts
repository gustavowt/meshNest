import { ref, watchEffect } from 'vue'
import type { Ref } from 'vue'

/**
 * Loads a stored render PNG through the desktop bridge and exposes it
 * as an object URL usable in <img>. Revokes stale URLs automatically.
 */
export function useRenderAssetUrl(getPath: () => string | undefined): Ref<string | null> {
  const url = ref<string | null>(null)

  watchEffect(async (onCleanup) => {
    const path = getPath()
    url.value = null
    if (!path || !window.meshNest) {
      return
    }

    let revoked = false
    onCleanup(() => {
      revoked = true
      if (url.value) {
        URL.revokeObjectURL(url.value)
        url.value = null
      }
    })

    try {
      const bytes = await window.meshNest.readRenderAsset(path)
      if (revoked) {
        return
      }
      const blob = new Blob([new Uint8Array(bytes)], { type: 'image/png' })
      url.value = URL.createObjectURL(blob)
    } catch {
      // Missing/unreadable thumbnails fall back to the placeholder.
    }
  })

  return url
}
