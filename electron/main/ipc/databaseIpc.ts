import { ipcMain } from 'electron'
import { AiDescriptionRepository } from '../../../src/services/database/aiDescriptionRepository'
import { EmbeddingRepository } from '../../../src/services/database/embeddingRepository'
import { GeometryMetadataRepository } from '../../../src/services/database/geometryMetadataRepository'
import { IndexingJobRepository } from '../../../src/services/database/indexingJobRepository'
import { LibraryRepository } from '../../../src/services/database/libraryRepository'
import { ModelFileRepository } from '../../../src/services/database/modelFileRepository'
import { ThreeMfMetadataRepository } from '../../../src/services/database/threeMfMetadataRepository'
import type { IndexingJobType } from '../../../src/types/indexing'
import type { AIModelDescription, ModelEmbedding } from '../../../src/types/llm'
import type { ScannedFile } from '../../../src/types/modelFile'
import type { GeometryMetadata, ThreeMfPackageMetadata } from '../../../src/types/modelMetadata'
import { getDatabaseClient } from '../services/database'

export function registerDatabaseIpc(): void {
  ipcMain.handle('database:upsertModelFile', async (_event, file: ScannedFile, projectId: string) => {
    const repository = new ModelFileRepository(await getDatabaseClient())
    return repository.upsertModelFile(file, projectId)
  })

  ipcMain.handle('database:listModelFiles', async (_event, projectId?: string) => {
    const repository = new ModelFileRepository(await getDatabaseClient())
    return repository.listModelFiles(projectId)
  })

  ipcMain.handle('database:listLibraryEntries', async (_event, projectId?: string) => {
    const repository = new LibraryRepository(await getDatabaseClient())
    return repository.listLibraryEntries(projectId)
  })

  ipcMain.handle(
    'database:storeGeometryMetadata',
    async (_event, modelFileId: string, metadata: GeometryMetadata) => {
      const repository = new GeometryMetadataRepository(await getDatabaseClient())
      await repository.upsert(modelFileId, metadata)
    },
  )

  ipcMain.handle(
    'database:storeThreeMfMetadata',
    async (_event, modelFileId: string, metadata: ThreeMfPackageMetadata) => {
      const repository = new ThreeMfMetadataRepository(await getDatabaseClient())
      await repository.upsert(modelFileId, metadata)
    },
  )

  ipcMain.handle(
    'database:storeAiDescription',
    async (_event, modelFileId: string, description: AIModelDescription, rawResponseJson: string) => {
      const repository = new AiDescriptionRepository(await getDatabaseClient())
      await repository.upsert(modelFileId, description, rawResponseJson)
    },
  )

  ipcMain.handle(
    'database:storeEmbedding',
    async (_event, embedding: Omit<ModelEmbedding, 'createdAt'>) => {
      const repository = new EmbeddingRepository(await getDatabaseClient())
      await repository.upsert(embedding)
    },
  )

  ipcMain.handle('database:markIndexed', async (_event, modelFileId: string) => {
    const repository = new ModelFileRepository(await getDatabaseClient())
    await repository.markIndexed(modelFileId)
  })

  ipcMain.handle('database:markFailed', async (_event, modelFileId: string, errorMessage: string) => {
    const repository = new ModelFileRepository(await getDatabaseClient())
    await repository.markFailed(modelFileId, errorMessage)
  })

  ipcMain.handle(
    'database:createIndexingJob',
    async (_event, job: { id: string; absolutePath: string; jobType: IndexingJobType }) => {
      const repository = new IndexingJobRepository(await getDatabaseClient())
      await repository.create(job)
    },
  )

  ipcMain.handle('database:markIndexingJobRunning', async (_event, id: string) => {
    const repository = new IndexingJobRepository(await getDatabaseClient())
    await repository.markRunning(id)
  })

  ipcMain.handle(
    'database:finishIndexingJob',
    async (
      _event,
      id: string,
      status: 'succeeded' | 'failed' | 'cancelled',
      modelFileId?: string,
      errorMessage?: string,
    ) => {
      const repository = new IndexingJobRepository(await getDatabaseClient())
      await repository.finish(id, status, modelFileId, errorMessage)
    },
  )

  ipcMain.handle('database:listIndexingJobs', async (_event, limit?: number) => {
    const repository = new IndexingJobRepository(await getDatabaseClient())
    return repository.listRecent(limit)
  })
}
