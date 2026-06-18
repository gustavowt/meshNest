<template>
  <div ref="container" class="model-preview">
    <div v-if="state === 'loading'" class="model-preview__overlay">
      <ion-spinner name="crescent" />
      <span>Loading model...</span>
    </div>
    <div v-else-if="state === 'error'" class="model-preview__overlay model-preview__overlay--error">
      <span>{{ errorMessage }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IonSpinner } from '@ionic/vue'
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
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  DEFAULT_CAMERA_FOV_DEGREES,
  getCameraPlacement,
  normalizeModelScene,
} from '@/services/model-parsing/modelNormalizer'
import { loadStlSceneAsync } from '@/services/model-parsing/stlLoaderService'
import { loadThreeMfSceneAsync } from '@/services/model-parsing/threeMfLoaderService'
import type { SupportedModelExtension } from '@/types/modelFile'

const props = defineProps<{
  filePath: string
  extension: SupportedModelExtension
}>()

type PreviewState = 'loading' | 'ready' | 'error'

const container = ref<HTMLDivElement>()
const state = ref<PreviewState>('loading')
const errorMessage = ref('')

let renderer: WebGLRenderer | null = null
let scene: Scene | null = null
let camera: PerspectiveCamera | null = null
let controls: OrbitControls | null = null
let resizeObserver: ResizeObserver | null = null
let animationFrame = 0
let loadGeneration = 0

const PREVIEW_VIEW_DIRECTION = new Vector3(1, 0.8, 1)

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

  if (!window.meshNest) {
    state.value = 'error'
    errorMessage.value = '3D preview is only available in the desktop app.'
    return
  }

  try {
    const bytes = await window.meshNest.readModelFile(props.filePath)
    if (generation !== loadGeneration) return

    const modelScene = props.extension === 'stl'
      ? await loadStlSceneAsync(bytes)
      : await loadThreeMfSceneAsync(bytes)
    if (generation !== loadGeneration) return

    const normalized = normalizeModelScene(modelScene)
    if (generation !== loadGeneration || !container.value) {
      return
    }

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

    resizeObserver = new ResizeObserver(updateSize)
    resizeObserver.observe(container.value)
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
</style>
