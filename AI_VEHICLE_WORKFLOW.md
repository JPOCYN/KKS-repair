# AI-assisted vehicle additions

The public admin interface intentionally edits, shows, and hides existing vehicles only. Adding a vehicle is a deployment task because a useful record must be matched to verified private manual files and reader metadata.

## Required checks

1. Confirm the requested brand and model with the owner.
2. Find the exact manual-folder prefix in `private-transfer/manuals-index-modern.json`. Never invent or rename a private folder.
3. Confirm the folder and its default English page exist in `modern-manuals/catalog.json`.
4. Reuse an existing brand row or add a brand deliberately. Never create a duplicate with different spelling.
5. Add an English vehicle description and a locally served image under `public/vehicle-images/`. Do not hotlink third-party images.
6. Create the vehicle hidden first (`isShow: false`) through the repository or the retained admin POST endpoint.
7. Verify the detail page, modern-reader link, manual HTML and images, a small PDF, and a PDF range request before making the vehicle visible.
8. Run `npm run build`, `npm test`, `npm run verify:admin`, and `npm run verify:modern-reader` before deployment.

## Vehicle fields

- `brandId`: existing database brand ID
- `code`: short searchable model code
- `name`: customer-facing English vehicle name
- `imagePath`: local `/vehicle-images/...` path
- `synopsis`: original English description
- `folderName`: exact private manual-folder name
- `manualId`: recovered menu binding when available
- `menuType`: recovered manual type when available
- `sort`: catalogue order
- `isShow`: keep false until all checks pass

The unlinked `/admin/vehicles/new` route and `POST /admin/vehicles` endpoint remain available for an authenticated administrator or an AI operating with the owner's approval. They are not shown in the normal admin navigation.
