# App Review sample library

Small STL and 3MF files for verifying meshNest indexing, previews, and search.

## Files

| File | Format |
|------|--------|
| `box.stl` | ASCII STL |
| `box-binary.stl` | Binary STL |
| `simple.3mf` | 3MF package |

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
