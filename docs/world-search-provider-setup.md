# World Search Provider Setup

World Search is focused on 3D-printable models: STL, 3MF, and source listings that are useful to makers. Optional image-research credentials are stored locally in meshNest Settings and are used only by the Electron main process.

## Image Research: Google Cloud Vision Web Detection

Auth required: Google Cloud Vision API key.

This provider is optional and is used only for image-based World Search. When enabled, meshNest sends the uploaded image to Google Cloud Vision Web Detection first, gathers best-guess labels, related web entities, and matching page titles, then gives that context to the configured Vision AI provider before generating STL/3MF search terms.

Direct setup link: https://console.cloud.google.com/apis/library/vision.googleapis.com

1. Create or select a Google Cloud project.
2. Enable the Cloud Vision API for that project.
3. Create an API key with access to Cloud Vision.
4. In meshNest, open Settings -> World Search, enable Google Cloud Vision Web Detection, paste the key into Google Cloud Vision API key, and save.

Notes: This is not a 3D model repository connector. It improves object/character/product recognition for uploaded images before meshNest queries STL and 3MF sources. If it is disabled, image search keeps using the existing direct Vision AI flow.

## Sketchfab

Auth required: optional API token.

1. Basic public metadata search works without a token.
2. For authenticated access, create or sign in to a Sketchfab account.
3. Open Sketchfab account settings and create an API token.
4. In meshNest, open Settings -> World Search, enable Sketchfab, optionally paste the token into API token, and save.

Notes: Sketchfab is a broad 3D asset library, not a pure 3D-print repository. meshNest queries it with downloadable and printable/STL-focused filters to keep results relevant to 3D printing.

## Printables

Auth required: none.

1. No token setup is needed.
2. In meshNest, open Settings -> World Search, enable Printables, and save.

Notes: meshNest queries Printables public GraphQL for listing metadata. Results open on Printables; meshNest does not download Printables files in this phase.

## MakerWorld

Auth required: none.

1. No token setup is needed.
2. In meshNest, open Settings -> World Search, enable MakerWorld, and save.

Notes: meshNest queries MakerWorld/Bambu search metadata for printable models. Results open on MakerWorld; meshNest does not download MakerWorld files in this phase.

## Creality Cloud

Auth required: none.

1. No token setup is needed.
2. In meshNest, open Settings -> World Search, enable Creality Cloud, and save.

Notes: Creality Cloud is a print-focused model library. meshNest queries Creality Cloud smart search for listing metadata and opens results on Creality Cloud. meshNest does not download Creality Cloud files in this phase.

## Thingiverse

Auth required: API token.

1. Create or sign in to a Thingiverse account.
2. Create a Thingiverse app/API token.
3. In meshNest, open Settings -> World Search, enable Thingiverse in Token-required repositories, paste the token into API token, and save.

Notes: Thingiverse anonymous metadata requests return Cloudflare challenge pages from Electron/Node. meshNest therefore keeps Thingiverse disabled by default and only queries it when an API token is configured. Results open on Thingiverse; meshNest does not download Thingiverse files in this phase.

## Thangs

Auth required: API token.

1. Create or sign in to a Thangs account.
2. Create or obtain a Thangs API token.
3. In meshNest, open Settings -> World Search, enable Thangs in Token-required repositories, paste the token into API token, and save.

Notes: Thangs anonymous metadata requests return Cloudflare challenge pages from Electron/Node. meshNest therefore keeps Thangs disabled by default and only queries it when an API token is configured. Results open on Thangs; meshNest does not download Thangs files in this phase.
