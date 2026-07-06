---
name: poster-layer-psd
description: Split poster, app screenshot, landing-page mockup, or marketing image elements into positioned editable PSD layers and a ZIP of transparent layer assets. Use when the user asks to decompose a flat image into layers, preserve original element positions, make a PSD from a screenshot, export layer PNGs, create a layer manifest, or repeat this workflow for similar posters.
---

# Poster Layer PSD

## Workflow

1. Inspect the source image size and identify major editable elements.
2. Create or update a JSON layer config. Use `assets/plant_app_config.example.json` as a coordinate example and `references/config-schema.md` for supported fields.
3. Run `scripts/poster_layer_psd.py` with the source image, config, output directory, and basename.
4. Check the generated preview PNG for coordinate mistakes. Adjust boxes and rerun when needed.
5. Deliver the PSD, ZIP, manifest JSON, and preview PNG.

## Command

```bash
python scripts/poster_layer_psd.py \
  --source path/to/source.jpg \
  --config path/to/layers.json \
  --out path/to/output_dir \
  --basename poster_name
```

The script writes:

- `<basename>_editable.psd`
- `<basename>_layer_assets.zip`
- `<basename>_layers_manifest.json`
- `<basename>_layered_preview.png`
- `<basename>_layers/*.png`

## Layer Strategy

Use extracted PNG layers for text, icons, photos, logos, and decorative objects. Use generated panel layers for simple cards, navigation bars, and soft shadows when the source image has white UI containers; this makes the PSD easier to edit than keeping every card as a flattened crop.

Prefer these extract modes:

- `nonbg` or `light-bg`: text/icons on a pale background.
- `photo`: exact crop, with optional rounded corners.
- `circle`: avatars or circular icons.
- `plant`: green plant/object on a pale background.
- `raw`: exact crop with no transparency processing.

For clean editable backgrounds, use `background.mode: clean` with rectangular masks for large foreground regions and `alpha_from_layers` for shaped objects such as plants.

## Validation

Always run the script once and verify:

- PSD opens or can be read by Pillow as `format == "PSD"`.
- Manifest layer count matches the number of PNG assets.
- ZIP passes `zipfile.testzip()`.
- Preview image has the original canvas size and visibly preserves layout positions.
