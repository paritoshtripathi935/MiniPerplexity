# Docs page screenshots

Drop screenshots in this directory and reference them from
`frontend/src/pages/DocsPage.tsx` via the `imageSrc` field on the
section definition.

## How to add a screenshot

1. Capture the screenshot. Recommended: 16:9 aspect ratio (the
   `<DocsPage>` renderer wraps the image in an `aspect-video`
   container). 1920×1080 is plenty — Vite + the browser scale it
   down. Keep under ~500 kB per image for snappy loads.

2. Save it as `frontend/public/docs/<feature-id>.png` (or `.jpg`,
   `.webp`). Use the section's `id` as the filename so the mapping is
   obvious. Examples:
     - `getting-started.png`
     - `projects-campaigns.png`
     - `investigations.png`
     - `studio.png`

3. Edit the relevant section in `DocsPage.tsx`'s `buildSections()`:

   ```ts
   {
     id: 'studio',
     ...
     placeholder: 'studio composer + timeline',     // ← keep as fallback
     imageSrc: '/docs/studio.png',                   // ← add this
     imageAlt: 'Studio composer with three generated previews', // ← optional
     ...
   }
   ```

4. Both fields cohabit cleanly:
   - `imageSrc` set → renders the real screenshot
   - `imageSrc` unset → falls back to the hatched placeholder block

## Sections that currently expect a screenshot

These already have a `placeholder` field, so dropping an `imageSrc`
in is a one-line change:

| Section id            | Suggested screenshot                                       |
|-----------------------|------------------------------------------------------------|
| `getting-started`     | The home page after first sign-in                          |
| `projects-campaigns`  | The projects list OR a campaign home page                  |
| `investigations`      | A streaming investigation with inline `[N]` citation pills |
| `studio`              | The Studio composer with the review-previews timeline      |
| `creatives`           | The campaign creatives library with mixed PDF + image tiles |
| `integrations`        | The /settings/integrations grid                            |

Anything else can also get one — just add `placeholder` to the
section and follow the same pattern.

## Image dimensions + cropping

The renderer uses `object-cover` inside an `aspect-video` container.
Images that aren't 16:9 will be center-cropped (top + bottom or
left + right). If a specific section needs a different aspect, edit
the container in `SectionBlock` (currently `aspect-video`).

## Vite serving

Anything under `frontend/public/` is served at the matching URL
without bundling. `frontend/public/docs/studio.png` is fetched as
`/docs/studio.png` in the browser. No build step needed — drop the
file, refresh, the image appears.
