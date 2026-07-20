# App Review sample library

STL and 3MF files for verifying meshNest indexing, previews, metadata, and search.

## Files

| File | Format | Description |
|------|--------|-------------|
| `sample-box.stl` | ASCII STL | 30 mm subdivided cube (~768 triangles) |
| `sample-box-binary.stl` | Binary STL | Same geometry as `sample-box.stl` |
| `sample-cylinder.stl` | ASCII STL | 32-sided cylinder with caps (~192 triangles) |
| `storage-box-with-lid.3mf` | 3MF | Two-part subdivided model (body + lid), PLA colors, metadata, thumbnail (~6 KB) |
| `simple-cube.3mf` | 3MF | Single-object cube with title metadata |

## How to use (App Review)

1. Download and unzip `meshNest-app-review-samples.zip` from the [GitHub release](https://github.com/gustavowt/meshNest/releases/tag/app-review-samples-v1).
2. Open meshNest.
3. Go to **Library** (or **Settings**) and choose this folder.
4. Wait for indexing to finish.

No account or API keys are required. Built-in embeddings and semantic search work with default settings. Vision AI is optional (Settings).

## Regenerate

```bash
node scripts/generate-review-samples.mjs
cd samples && zip -r ../meshNest-app-review-samples.zip .
```
