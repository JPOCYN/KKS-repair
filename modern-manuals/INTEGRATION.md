# Supercar Docs modern manual reader

This directory is a standalone responsive reader for all recovered McLaren service manuals. It does not modify or duplicate the original `manuals` directory.

## What is included

- `index.html` — the reader interface
- `reader.css` — Supercar Docs branding, responsive layout, legacy-content normalization, and print styling
- `reader.js` — catalog navigation, safe legacy-page loading, URL rewriting, search, themes, and mobile controls
- `catalog.json` — generated index for all 16 manuals and 9,970 English documents
- `build-catalog.mjs` — regenerates the index if the recovered catalog changes
- `pdfs/` — 1,434 recovered original PDF attachments, stored by manual and section
- `pdf-manifest.json` — PDF inventory, paths, sizes, and recovery status
- `recover-pdfs.mjs` — verifies the inventory and can recover missing PDFs from the original site
- `validate.mjs` — validates the reader against every indexed source document
- `validate-pdfs.py` — opens every PDF and validates its page structure

## Current folder layout

Keep this directory beside the existing manuals directory:

```text
website-root/
  manuals/
  modern-manuals/
```

The reader references the existing manual HTML and image assets. The local `modern-manuals/pdfs` folder is recovery input only and is excluded from Git and the Node.js deployment. In production, those PDFs are added to the existing private manual bundle and streamed through the authenticated `/manuals/pdfs/...` endpoint.

## Reader URL

Use this URL pattern when linking from the current website:

```text
/modern-manuals/index.html?manual={manual-folder}&page={section}/{document}.html
```

Example:

```text
/modern-manuals/index.html?manual=McLaren-SIS-750S-Coupe&page=Repair%2F11112-2.html
```

## Production integration requirements

1. Include only `index.html`, `reader.css`, `reader.js`, and `catalog.json` in the Node.js application archive.
2. Serve `/modern-manuals/*` behind the same authenticated access controls as the service library.
3. Upload the five additive PDF bundle parts to private storage, then publish the merged manual index last.
4. Keep the original `/manuals/` URLs available because the reader loads source HTML, illustrations, and PDFs through that protected route.
5. Do not put PDFs under `public/` or deploy `modern-manuals/pdfs` with the application.

## PDF recovery and validation

The complete raw library contains 1,434 PDF-wrapper pages, including linked sub-pages. All 1,434 original PDF files have been recovered into this directory and are opened locally by the modern reader.

Validation result:

- 1,434 referenced PDFs available; 0 missing
- 11,233 pages opened successfully
- 1,108,900,320 bytes total (about 1.03 GiB)
- 0 encrypted PDFs and 0 structural errors

Run the checks again after copying or deploying the folder:

```text
node validate.mjs
python validate-pdfs.py
node recover-pdfs.mjs --dry-run
```
