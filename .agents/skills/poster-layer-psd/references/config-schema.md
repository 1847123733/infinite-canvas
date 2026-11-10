# Config Schema

The script expects JSON with optional `basename`, `strategy`, `background`, and required `layers`. Boxes use source pixels with exclusive right/bottom edges.

For simple UI, set `strategy: "semantic-ui"` and `background.mode: "solid"`. Every layer must declare `role` (`container`, `text`, `icon`, `photo`, `object`) and may declare `parent`, the name of an earlier container. Containers must use a generated `type` and explicit opaque `fill`; populated raw crops and partition backgrounds are rejected. Use one `circle` asset for a complete glyph plus its circular disc, with no duplicate inner-glyph layer. Parent relationships are manifest metadata, not PSD folder groups.

```json
{
  "basename": "ui_layers",
  "strategy": "semantic-ui",
  "background": {
    "mode": "solid",
    "name": "00_rebuilt_background",
    "fill": [248, 250, 245]
  },
  "layers": [
    {
      "name": "01_card_bg",
      "role": "container",
      "type": "panel",
      "box": [48, 891, 317, 1245],
      "radius": 18,
      "fill": [255, 255, 255, 255]
    },
    {
      "name": "02_card_title",
      "role": "text",
      "parent": "01_card_bg",
      "box": [71, 1108, 156, 1145],
      "extract": "nonbg"
    },
    {
      "name": "03_water_icon_with_disc",
      "role": "icon",
      "parent": "01_card_bg",
      "box": [258, 1104, 301, 1147],
      "extract": "circle"
    },
    {
      "name": "04_hero_plant",
      "role": "object",
      "box": [547, 184, 941, 419],
      "extract": "plant",
      "foreground_polygon": [
        [732, 345],
        [876, 345],
        [871, 418],
        [732, 418]
      ]
    }
  ]
}
```

This is a structural excerpt, not a complete image inventory. The full plant App example is in `assets/plant_app_config.example.json`. All sample coordinates, fills, and protection polygons are source-specific.

## Background

- `mode: "partition"`: preserve the source background and assign overlapping opaque pixels to the topmost layer. Moving a layer exposes transparent holes; hidden content is not reconstructed. Prefer this for textured posters to avoid blurred blocks and duplicate content in overlapping crops. Use exact crop layers for existing containers to preserve their original appearance.
- `mode: "source"`: use the source image as background, including original foreground content. Moving an extracted layer can expose its original copy; this does not demonstrate a cleaned editable background.
- `mode: "solid"`: use `fill` as a flat background.
- `mode: "clean"`: blur and tint masked foreground regions as an approximation; this is not content-aware background reconstruction and is not used for semantic UI.

`masks` are source-coordinate rectangles. `alpha_from_layers` uses the extracted alpha channel of named layers to clean irregular shapes without hard rectangular edges.

## Layer Fields

- `name`: PSD layer and PNG filename stem. Required.
- `box`: `[left, top, right, bottom]` in source image coordinates. Required.
- `role`: required for semantic UI; `container`, `text`, `icon`, `photo`, or `object`.
- `parent`: optional name of a preceding container; recorded in the manifest without creating a PSD folder group.
- `extract`: crop extraction mode. Defaults to `raw`.
- `exclude_boxes`: rectangles `[left, top, right, bottom]` in source coordinates to erase from a crop layer. Use for a frame's photo interior or unrelated content inside a large decoration/path box; do not let a frame crop keep the photo pixels or a path crop keep nearby text. Not available for generated layers.
- `type`: generated layer type. Supported: `panel`, `nav-bar`, `solid`.
- `radius`: rounded-corner radius for `photo`, `panel`, and generated solid layers.
- `rect`: local rectangle for panel body inside the asset box.
- `fill`: `[r, g, b]` or `[r, g, b, a]` for generated layers.
- `shadow_alpha`, `shadow_blur`, `shadow_offset`: panel shadow controls.
- `foreground_polygon`: source-coordinate `[x, y]` points outlining a known visible interior of an object/plant that must stay opaque, such as a pale pot. Do not outline surrounding background. Applied before edge feathering; original interior colors are preserved.
- `low`, `high`: color-key distance thresholds, defaulting to 9 and 44; normally retain the defaults.

For semantic UI, `fill` must be explicit and opaque on every container. Rebuilt surfaces contain no original child text/icons, and are not punctured when those children are extracted. `rect` is local to a panel asset and includes its right/bottom boundary; `box` uses exclusive source bounds. Panel shadow padding and circle normalization can change exported asset bounds; use the manifest's actual `left`, `top`, `width`, and `height` to place assets.

## Extract Modes

- `raw`: exact crop, opaque.
- `photo`: exact crop, optional rounded alpha mask.
- `circle`: complete circular alpha mask, preserving all source pixels inside it. A narrow rectangular box is expanded to a square around its center within the source bounds; pixels are not stretched. Include the full circular disc, not only the inner glyph.
- `nonbg` / `light-bg`: make pale source background transparent.
- `color-bg`: remove the border-sampled flat background color, including dark or saturated backgrounds. The same border sampling is used by `nonbg` and `light-bg`. Leave a small margin of background around text, and use this only for locally uniform backgrounds; photographs and gradients need masks beyond a color key.
- `object`: segment an irregular subject using the local isnet_fp16 model and protect interior highlights by the outer silhouette. Requires the bundled Node runtime and prepared background-removal assets.
- `plant`: the same model with additional pale-background contrast support for faint green leaves, avoiding the old green-color/hand-position heuristic. Use only on pale locally uniform backgrounds; inspect blurred edges. `foreground_polygon` can protect the visible pale pot.

Use `photo` only for rectangular photographs, not for decorative plants, people, or products without a rectangular frame. A decorative plant is `role: object` with `extract: plant`; a leaf logo is `role: icon` with color-key or circle extraction. Keep the circular disc and its glyph in one asset. Text assets are raster pixels, not editable Photoshop text objects.

## Automated Review

Return `pass`, `warn`, or `revise` with `issues` and `changes`. For example:

```json
{
  "status": "revise",
  "issues": ["水滴图层未包含完整圆底"],
  "changes": [
    {
      "name": "03_water_icon_with_disc",
      "layers": [
        {
          "name": "03_water_icon_with_disc",
          "role": "icon",
          "parent": "01_card_bg",
          "box": [258, 1104, 301, 1147],
          "extract": "circle"
        }
      ]
    }
  ]
}
```

Each change references an existing layer and replaces it at the same position with complete layer specs; one layer may become several, and an empty array deletes it. Names remain unique and parents still precede children. Preserve the background, return local replacements instead of a full config, and do not submit unchanged replacements. Unresolved quality concerns use `warn` while preserving exports; file-generation errors remain failures.
