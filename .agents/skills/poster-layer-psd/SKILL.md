---
name: poster-layer-psd
description: Split poster, app screenshot, landing-page mockup, or marketing image elements into positioned editable PSD layers and a ZIP of transparent layer assets. Use when the user asks to decompose a flat image into layers, preserve original element positions, make a PSD from a screenshot, export layer PNGs, create a layer manifest, or repeat this workflow for similar posters.
---

# Poster Layer PSD

## Workflow

1. Inspect the source image size and identify semantic units and containment before choosing boxes. A droplet and its colored circular disc are one complete icon; adjacent text is separate. For simple UI images, encode this decision using `strategy: "semantic-ui"`, per-layer `role`, and optional `parent`.
2. Choose semantic UI reconstruction or textured-poster partitioning before creating the JSON config. Use `references/config-schema.md` for supported fields. `assets/plant_app_config.example.json` demonstrates the corrected plant App decomposition: complete icons, separate text, opaque containers, and a segmented hero plant. Its coordinates, colors, and layer count apply only to that source image.
3. Run `scripts/poster_layer_psd.py` with the source image, config, output directory, and basename.
4. Compare the composite preview with the source and inspect every numbered layer in the contact sheets. Also render icons hidden/moved over their containers, and irregular subjects over checkerboard/dark backgrounds. Fix only the affected elements. A matching composite alone does not prove correct separation.
5. Deliver the PSD, ZIP, manifest JSON, and preview PNG. Explain any reconstructed backgrounds, remaining edge limitations, or transparent gaps from partitioning; do not describe raster text as editable font/text objects.

## Command

```bash
python .agents/skills/poster-layer-psd/scripts/poster_layer_psd.py \
  --source path/to/source.jpg \
  --config path/to/layers.json \
  --out path/to/output_dir \
  --basename poster_name
```

Run from the project root. Replace `python` with the project's extracted Python executable when needed; Pillow and NumPy are required. The complete skill directory must stay with the project because object extraction uses sibling scripts and the project's offline model assets.

`plant` / `object` require Node (bundled `web/node.exe` / `web/node`, or available on PATH), the model data under `web/public/background-removal/1.7.0/data/`, and the matching CPU runtime. If assets are missing, run `bun run prepare:background-removal` from `web/`. This uses the existing local `isnet_fp16` weights, without a quantized-model fallback. Raw masks for identical crops are cached; a local fix does not require another full-image recognition request.

The script writes:

- `<basename>_editable.psd`
- `<basename>_layer_assets.zip`
- `<basename>_layers_manifest.json`
- `<basename>_layered_preview.png`
- `<basename>_layers_contact_sheet_001.png` and subsequent pages (12 isolated layers per page, numbered in manifest order)
- `<basename>_layers/*.png`

## Layer Strategy

One layer represents one independently editable element. Split card/button backgrounds, text, icons, badges, and photos into separate layers. For example, a product card needs separate background, photo, title, description, price, button background, button label, and any icons; a navigation item needs separate icon and label. Split unrelated text blocks and list items. Keep a natural phrase or a coherent paragraph together, never split text into individual characters. Keep a single photo or coherent subject together rather than splitting its internal details.

Choose the layer count from the element inventory, without a target count or a 60-layer ceiling. Do not merge elements just to reduce the number of layers. Avoid mixed layers named `card_content`, `tile_content`, or `title_logo`; name each layer after its actual element. Text layers contain rasterized text pixels, not editable font/text objects.

Prioritize business content: titles, body text, prices, photos, buttons, and navigation icons/labels. A phone status bar (time, signal, Wi-Fi, battery) may remain one layer. An icon's dots, glow, and internal decoration need not be separated. These minor details must not reject otherwise usable output.

The script crops, applies color/shape masks, and segments irregular objects with the same local isnet_fp16 weights used by the canvas. It cannot reconstruct occluded content, and uncertain edges still need inspection. Do not present an opaque rectangular crop as an irregular subject cutout.

For automated execution, generate once, inspect once, and apply at most one batch of local layer replacements. The review returns `pass`, `warn`, or `revise`; `revise` includes `changes: [{"name": "existing_layer", "layers": [replacement_specs]}]`, not a full config. Preserve valid exports and report remaining quality concerns as advisories. File generation errors still fail the task.

For simple flat UI, use `strategy: "semantic-ui"` with a solid rebuilt page background and opaque generated containers. Every layer needs a `role`: `container`, `text`, `icon`, `photo`, or `object`. Optional `parent` references an earlier container. Rebuild cards without text/icons, then place complete source icons, photos, and isolated text above them. Preserve a circular disc and its glyph as one `circle` asset, without also extracting a duplicate glyph/disc. Never crop an entire populated card as its background, or subtract children from a reconstructed container. Moving an icon must expose a complete card with no hole or ghost icon. These semantic relationships are stored in the manifest, not PSD folder groups.

For textured posters, use `background.mode: partition` to preserve visible pixels. Hidden content stays transparent; it is not a restored background. With partition mode, crop containers exactly, place them below their contents, and let pixel ownership cut out separately extracted elements. Never replace textured paper, product trays, or illustrated cards with guessed white panels.

## Classify Before Extracting

| Visible content                                   | Role and extraction                       | Required distinction                                                                          |
| ------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------- |
| Photo with a visible rectangular boundary         | `photo` / `photo`                         | A plant photo inside a card stays a photo; keep external labels out of its crop.              |
| Decorative potted plant on pale background        | `object` / `plant`                        | Remove the rectangular background while retaining faint leaves and the visible pot.           |
| Other irregular subject, such as a person/product | `object` / `object`                       | Segment the subject rather than treating its bounding rectangle as a clean cutout.            |
| Leaf symbol in a logo or button                   | `icon` / `nonbg`, `color-bg`, or `circle` | A leaf drawing is an icon, not a potted plant requiring subject segmentation.                 |
| Droplet, plus, or book with a circular disc       | `icon` / `circle`                         | Keep disc and glyph together; adjacent text is separate, with no duplicate inner-glyph layer. |

Record classification and containment directly in the config using `role`, `parent`, and the extraction fields. This does not require a separate model call before generating the config. Do not copy the source-specific plant or pot protection coordinates into unrelated images.

Prefer these extract modes:

- `nonbg` or `light-bg`: text/icons on a pale background.
- `color-bg`: text/icons on a locally uniform colored or dark background; keep the border clear of neighboring elements.
- `photo`: exact crop, with optional rounded corners.
- `object`: local model segmentation for an irregular subject; use `role: object`, not `photo`.
- `circle`: avatars or circular icons.
- `plant`: local model segmentation plus pale-background contrast to retain faint green leaves. Optional `foreground_polygon` protects known visible subject interiors, such as the pale pot; never include surrounding background.
- `raw`: exact crop with no transparency processing.

Circle crops expand narrow boxes to a square without stretching pixels. Generated panel shadows can also expand asset bounds. Use manifest positions and dimensions when placing the exported PNGs, rather than assuming they equal the config box.

`background.mode: clean` only blurs and tints selected regions; it is not content-aware reconstruction. Use it only when that approximation is appropriate. For semantic UI, rebuild opaque surfaces instead. Rebuilt colors/shadows can differ slightly from the source, so do not promise pixel-identical appearance for that strategy.

## Follow-up Changes

When the user approves most layers and asks to fix one element, preserve the approved PNGs and positions, replace the target layer, then rebuild all deliverables. Use the existing script export functions; the CLI does not have a selective-update flag. Compare hashes for the untouched assets. If a shared extraction algorithm changes, reprocessing every layer may alter unrelated icons; reuse their approved pixels instead of claiming only one layer changed.

## Validation

Always run the script once and verify:

- PSD opens or can be read by Pillow as `format == "PSD"`.
- Manifest layer count matches the number of PNG assets.
- ZIP passes `zipfile.testzip()`.
- Preview image has the original canvas size and visibly preserves layout positions.
- Contact sheets show text, icons, and backgrounds separately; no crop bundles unrelated elements or includes a neighboring element. Cross-check the source inventory against both the layer config and the isolated layers, not just their names. Use tighter boxes when padded crops capture neighbors. A `raw`/`photo` crop of a complete card is not an independently editable decomposition of its contents.
- For semantic UI, also render an icon hidden or moved: its disc and glyph stay intact, neighboring text stays in place, and the card beneath remains complete. Inspect container-only previews for residual text/icons. Do not accept a matching composite as a substitute for these editing checks.
- Inspect decorative plants/subjects on checkerboard and a dark background. Reject an opaque rectangle; check faint outer leaves and opaque pot/highlights against the source and raw model mask. The model and runtime come from `web/public/background-removal/1.7.0/`, prepared by the existing background-removal preparation script; no quantized model fallback is used.
- Hidden/moved, container-only, and dark-background previews are additional validation composites to produce when relevant; the default export script does not automatically generate them. Report these checks only after actually inspecting them.
