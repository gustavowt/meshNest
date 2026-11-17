<template>
  <div ref="container" class="model-preview">
    <div v-if="state === 'loading'" class="model-preview__overlay">
      <ion-spinner name="crescent" />
      <span>Loading model...</span>
    </div>
    <div v-else-if="state === 'error'" class="model-preview__overlay model-preview__overlay--error">
      <span>{{ errorMessage }}</span>
    </div>

    <!-- Floating Filament Toolbar -->
    <div
      v-if="state === 'ready'"
      class="filament-toolbar"
      role="toolbar"
      :aria-label="$t('detail.filamentColor')"
      @pointerdown.stop
      @mousedown.stop
    >
      <button
        v-for="swatch in FILAMENT_PRESETS"
        :key="swatch.id"
        type="button"
        class="filament-swatch"
        :class="{ 'filament-swatch--active': isSwatchActive(swatch.hex) }"
        :style="{ backgroundColor: swatch.hex }"
        :title="swatch.name"
        :aria-label="swatch.name"
        @click="setColor(swatch.hex)"
      />

      <div class="toolbar-divider" />

      <label
        class="toolbar-btn custom-color-btn"
        :class="{ 'toolbar-btn--active': isCustomActive }"
        :title="$t('detail.customColor')"
        :aria-label="$t('detail.customColor')"
      >
        <ion-icon :icon="colorPaletteOutline" />
        <input
          type="color"
          :value="activeColor"
          class="color-picker-input"
          :aria-label="$t('detail.customColor')"
          @input="(e) => setColor((e.target as HTMLInputElement).value)"
        />
      </label>

      <button
        v-if="isColorOverridden"
        type="button"
        class="toolbar-btn reset-btn"
        :title="$t('detail.resetColor')"
        :aria-label="$t('detail.resetColor')"
        @click="resetColor"
      >
        <ion-icon :icon="refreshOutline" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IonIcon, IonSpinner } from '@ionic/vue'
import { colorPaletteOutline, refreshOutline } from 'ionicons/icons'
import {
  AmbientLight,
  DirectionalLight,
  Mesh,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three'
import type { Material, Object3D } from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  DEFAULT_CAMERA_FOV_DEGREES,
  getCameraPlacement,
  normalizeModelScene,
} from '@/services/model-parsing/modelNormalizer'
import { loadStlSceneAsync } from '@/services/model-parsing/stlLoaderService'
import { loadThreeMfSceneAsync } from '@/services/model-parsing/threeMfLoaderService'
import {
  FILAMENT_PRESETS,
  hashStringToFilamentColor,
} from '@/services/rendering/filamentColors'
import type { SupportedModelExtension } from '@/types/modelFile'

const props = defineProps<{
  filePath: string
  extension: SupportedModelExtension
}>()

type PreviewState = 'loading' | 'ready' | 'error'

const container = ref<HTMLDivElement>()
const state = ref<PreviewState>('loading')
const errorMessage = ref('')

const activeColor = ref<string>('')
const isColorOverridden = ref(false)
const hasMultiOrFileColor = ref(false)

let renderer: WebGLRenderer | null = null
let scene: Scene | null = null
let camera: PerspectiveCamera | null = null
let controls: OrbitControls | null = null
let resizeObserver: ResizeObserver | null = null
let animationFrame = 0
let loadGeneration = 0

const PREVIEW_VIEW_DIRECTION = new Vector3(1, 0.8, 1)

function isSwatchActive(hex: string): boolean {
  return Boolean(activeColor.value) && activeColor.value.toLowerCase() === hex.toLowerCase()
}

const isCustomActive = computed(() => {
  return (
    isColorOverridden.value &&
    !FILAMENT_PRESETS.some((preset) => preset.hex.toLowerCase() === activeColor.value.toLowerCase())
  )
})

function forEachMaterial(mesh: Mesh, callback: (material: Material) => void): void {
  const materials: Material[] = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
  materials.forEach(callback)
}

function hasColorProperty(
  material: Material,
): material is Material & {
  color: { set: (c: unknown) => void; getHexString?: () => string }
  vertexColors: boolean
} {
  return 'color' in material && 'vertexColors' in material
}

function checkIsMultiColoredOrFileColored(root: Object3D): boolean {
  let hasEmbeddedColors = false
  const uniqueColors = new Set<string>()

  root.traverse((child) => {
    if (child instanceof Mesh) {
      if (child.userData.hasFileColor || child.userData.hasVertexColors) {
        hasEmbeddedColors = true
      }
      forEachMaterial(child, (material) => {
        if (hasColorProperty(material)) {
          const hex = typeof material.color.getHexString === 'function'
            ? material.color.getHexString().toLowerCase()
            : String(child.userData.originalColor ?? '').toLowerCase()
          if (hex) {
            uniqueColors.add(hex)
          }
        }
      })
    }
  })

  return hasEmbeddedColors || uniqueColors.size > 1
}

function setColor(hex: string): void {
  if (!scene) return
  scene.traverse((child) => {
    if (child instanceof Mesh) {
      forEachMaterial(child, (material) => {
        if (hasColorProperty(material)) {
          if (material.vertexColors) {
            material.vertexColors = false
            material.needsUpdate = true
          }
          material.color.set(hex)
        }
      })
    }
  })
  activeColor.value = hex
  isColorOverridden.value = true
}

function resetColor(): void {
  if (!scene) return
  const autoColor = hashStringToFilamentColor(props.filePath)
  scene.traverse((child) => {
    if (child instanceof Mesh) {
      const originalHasVertexColors = Boolean(child.userData.hasVertexColors)
      forEachMaterial(child, (material) => {
        if (hasColorProperty(material)) {
          if (material.vertexColors !== originalHasVertexColors) {
            material.vertexColors = originalHasVertexColors
            material.needsUpdate = true
          }
          material.color.set(child.userData.originalColor ?? autoColor)
        }
      })
    }
  })
  isColorOverridden.value = false
  activeColor.value = hasMultiOrFileColor.value ? '' : autoColor
}

/**
 * Yields control back to the browser for one frame so the loading overlay
 * can paint before the synchronous WebGL setup + first render (the GPU
 * upload) runs on the main thread.
 */
function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve())
    } else {
      setTimeout(resolve, 0)
    }
  })
}

function disposeObject(object: Object3D): void {
  object.traverse((child) => {
    if (child instanceof Mesh) {
      child.geometry.dispose()
      const materials: Material[] = Array.isArray(child.material) ? child.material : [child.material]
      materials.forEach((material) => material.dispose())
    }
  })
}

function disposeThree(): void {
  cancelAnimationFrame(animationFrame)
  resizeObserver?.disconnect()
  resizeObserver = null
  controls?.dispose()
  controls = null
  if (scene) {
    disposeObject(scene)
    scene.clear()
    scene = null
  }
  if (renderer) {
    renderer.dispose()
    renderer.domElement.remove()
    renderer = null
  }
  camera = null
}

function updateSize(): void {
  if (!renderer || !camera || !container.value) {
    return
  }
  const width = container.value.clientWidth || 1
  const height = container.value.clientHeight || 1
  renderer.setSize(width, height)
  camera.aspect = width / height
  camera.updateProjectionMatrix()
}

function animate(): void {
  animationFrame = requestAnimationFrame(animate)
  controls?.update()
  if (renderer && scene && camera) {
    renderer.render(scene, camera)
  }
}

async function loadModel(): Promise<void> {
  const generation = ++loadGeneration
  disposeThree()
  state.value = 'loading'
  errorMessage.value = ''
  isColorOverridden.value = false
  hasMultiOrFileColor.value = false
  activeColor.value = ''

  const autoColor = hashStringToFilamentColor(props.filePath)

  if (!window.meshNest) {
    state.value = 'error'
    errorMessage.value = '3D preview is only available in the desktop app.'
    return
  }

  try {
    const bytes = await window.meshNest.readModelFile(props.filePath)
    if (generation !== loadGeneration) return

    const modelScene = props.extension === 'stl'
      ? await loadStlSceneAsync(bytes, autoColor)
      : await loadThreeMfSceneAsync(bytes, autoColor)
    if (generation !== loadGeneration) return

    const normalized = normalizeModelScene(modelScene)
    if (generation !== loadGeneration || !container.value) {
      return
    }

    const isMultiOrFileColored = checkIsMultiColoredOrFileColored(normalized.root)
    hasMultiOrFileColor.value = isMultiOrFileColored
    activeColor.value = isMultiOrFileColored ? '' : autoColor

    // Let the loading overlay paint before the GPU upload on first render,
    // which is the main-thread cost that otherwise makes the page freeze.
    await yieldToBrowser()
    if (generation !== loadGeneration || !container.value) {
      return
    }

    renderer = new WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setClearColor(0x000000, 0)

    scene = new Scene()
    scene.add(new AmbientLight(0xffffff, 0.7))
    const keyLight = new DirectionalLight(0xffffff, 1.6)
    keyLight.position.set(1, 2, 1.5)
    scene.add(keyLight)
    const fillLight = new DirectionalLight(0xffffff, 0.6)
    fillLight.position.set(-1.5, -0.5, -1)
    scene.add(fillLight)
    scene.add(normalized.root)

    const placement = getCameraPlacement(normalized, PREVIEW_VIEW_DIRECTION)
    camera = new PerspectiveCamera(DEFAULT_CAMERA_FOV_DEGREES, 1, placement.near, placement.far)
    camera.position.copy(placement.position)
    camera.lookAt(placement.target)

    container.value.appendChild(renderer.domElement)
    renderer.domElement.style.display = 'block'

    controls = new OrbitControls(camera, renderer.domElement)
    controls.target.copy(placement.target)
    controls.enableDamping = true
    controls.update()

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(updateSize)
      resizeObserver.observe(container.value)
    }
    updateSize()

    state.value = 'ready'
    animate()
  } catch (error) {
    if (generation !== loadGeneration) return
    disposeThree()
    state.value = 'error'
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load model preview.'
  }
}

onMounted(loadModel)
watch(() => [props.filePath, props.extension], loadModel)
onBeforeUnmount(disposeThree)
</script>

<style scoped>
.model-preview {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 280px;
  overflow: hidden;
  background: transparent;
}

.model-preview__overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--ion-color-medium, #92949c);
  font-size: 14px;
  text-align: center;
  padding: 16px;
}

.model-preview__overlay--error {
  color: var(--ion-color-danger, #eb445a);
}

.filament-toolbar {
  position: absolute;
  bottom: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: var(--card-glass-bg, rgba(255, 255, 255, 0.8));
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: var(--card-glass-border, 1px solid rgba(255, 255, 255, 0.2));
  border-radius: 999px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  z-index: 10;
  max-width: calc(100% - 24px);
  overflow-x: auto;
  scrollbar-width: none;
}

.filament-toolbar::-webkit-scrollbar {
  display: none;
}

.filament-swatch {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.65);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.18);
  cursor: pointer;
  padding: 0;
  margin: 0;
  flex-shrink: 0;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  outline: none;
}

.filament-swatch:hover {
  transform: scale(1.18);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
}

.filament-swatch--active {
  box-shadow: 0 0 0 2px #ffffff, 0 0 0 4px var(--ion-color-primary, #4f46e5);
  transform: scale(1.1);
}

.toolbar-divider {
  width: 1px;
  height: 16px;
  background: rgba(127, 140, 159, 0.35);
  flex-shrink: 0;
  margin: 0 2px;
}

.toolbar-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 1px solid rgba(127, 140, 159, 0.25);
  background: var(--card-glass-bg, rgba(255, 255, 255, 0.8));
  color: var(--ion-text-color, #0c1630);
  cursor: pointer;
  padding: 0;
  margin: 0;
  flex-shrink: 0;
  font-size: 14px;
  transition: transform 0.15s ease, background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
  overflow: hidden;
}

.toolbar-btn:hover {
  transform: scale(1.12);
  color: var(--ion-color-primary, #4f46e5);
}

.toolbar-btn--active {
  box-shadow: 0 0 0 2px #ffffff, 0 0 0 4px var(--ion-color-primary, #4f46e5);
  color: var(--ion-color-primary, #4f46e5);
}

.color-picker-input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
  padding: 0;
  margin: 0;
  border: none;
}

.reset-btn {
  color: var(--ion-color-medium, #7f8c9f);
}

.reset-btn:hover {
  color: var(--ion-color-danger, #f5365c);
}
</style>
