# Config Schema

The script expects JSON with optional `basename`, `background`, and required `layers`.

```json
{
  "basename": "poster",
  "background": {
    "mode": "clean",
    "name": "00_clean_background",
    "fill": [250, 252, 247],
    "blur": 42,
    "tint": 0.78,
    "masks": [{"box": [35, 410, 905, 806]}],
    "alpha_from_layers": ["01_hero_object"]
  },
  "layers": [
    {"name": "01_hero_object", "box": [568, 168, 941, 421], "extract": "plant"},
    {"name": "02_card_bg", "type": "panel", "box": [35, 409, 906, 806], "rect": [10, 10, 860, 385], "radius": 18}
  ]
}
```

## Background

- `mode: "source"`: use the source image as background.
- `mode: "solid"`: use `fill` as a flat background.
- `mode: "clean"`: blur and tint masked foreground regions to create a cleaner editable background.

`masks` are source-coordinate rectangles. `alpha_from_layers` uses the extracted alpha channel of named layers to clean irregular shapes without hard rectangular edges.

## Layer Fields

- `name`: PSD layer and PNG filename stem. Required.
- `box`: `[left, top, right, bottom]` in source image coordinates. Required.
- `extract`: crop extraction mode. Defaults to `raw`.
- `type`: generated layer type. Supported: `panel`, `nav-bar`, `solid`.
- `radius`: rounded-corner radius for `photo`, `panel`, and generated solid layers.
- `rect`: local rectangle for panel body inside the asset box.
- `fill`: `[r, g, b]` or `[r, g, b, a]` for generated layers.
- `shadow_alpha`, `shadow_blur`, `shadow_offset`: panel shadow controls.

## Extract Modes

- `raw`: exact crop, opaque.
- `photo`: exact crop, optional rounded alpha mask.
- `circle`: circular alpha mask.
- `nonbg` / `light-bg`: make pale source background transparent.
- `plant`: preserve green plant/object pixels and pot-like muted pixels on pale backgrounds.
