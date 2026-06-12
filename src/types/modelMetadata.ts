/**
 * Geometry metadata extracted from a loaded STL/3MF scene.
 * All dimensions are expressed in millimeters.
 */
export type GeometryMetadata = {
  widthMm?: number
  heightMm?: number
  depthMm?: number
  triangleCount?: number
  vertexCount?: number
  meshCount?: number
  objectCount?: number
  surfaceAreaMm2?: number
  volumeMm3?: number
  isWatertight?: boolean
}

/**
 * Metadata extracted by parsing a .3mf file as a ZIP/XML package,
 * independently from the Three.js scene loader.
 */
export type ThreeMfPackageMetadata = {
  objectNames: string[]
  materialNames: string[]
  colorValues: string[]
  hasThumbnail: boolean
  thumbnailInternalPath?: string
  /** Raw extracted metadata kept as JSON for debugging. */
  rawMetadataJson: string
}
