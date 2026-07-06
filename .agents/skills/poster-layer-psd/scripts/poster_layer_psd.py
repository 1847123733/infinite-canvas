#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import struct
import sys
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter


@dataclass
class Layer:
    name: str
    image: Image.Image
    left: int
    top: int
    kind: str

    @property
    def width(self) -> int:
        return self.image.width

    @property
    def height(self) -> int:
        return self.image.height

    @property
    def right(self) -> int:
        return self.left + self.width

    @property
    def bottom(self) -> int:
        return self.top + self.height


def u16(value: int) -> bytes:
    return struct.pack(">H", value)


def i16(value: int) -> bytes:
    return struct.pack(">h", value)


def u32(value: int) -> bytes:
    return struct.pack(">I", value)


def as_rgba(color: list[int] | tuple[int, ...], default_alpha: int = 255) -> tuple[int, int, int, int]:
    if len(color) == 3:
        return int(color[0]), int(color[1]), int(color[2]), default_alpha
    if len(color) == 4:
        return int(color[0]), int(color[1]), int(color[2]), int(color[3])
    raise ValueError(f"Expected RGB or RGBA color, got: {color}")


def as_rgb(color: list[int] | tuple[int, ...]) -> tuple[int, int, int]:
    if len(color) < 3:
        raise ValueError(f"Expected RGB color, got: {color}")
    return int(color[0]), int(color[1]), int(color[2])


def box_from_spec(spec: dict[str, Any]) -> tuple[int, int, int, int]:
    box = spec.get("box")
    if not isinstance(box, list) or len(box) != 4:
        raise ValueError(f"Layer {spec.get('name', '<unnamed>')} needs box: [left, top, right, bottom]")
    left, top, right, bottom = [int(v) for v in box]
    if right <= left or bottom <= top:
        raise ValueError(f"Invalid box for layer {spec.get('name', '<unnamed>')}: {box}")
    return left, top, right, bottom


def psd_pascal_string(name: str) -> bytes:
    raw = name.encode("macroman", "replace")[:255]
    data = bytes([len(raw)]) + raw
    data += b"\0" * ((4 - len(data) % 4) % 4)
    return data


def write_layered_psd(path: Path, canvas_size: tuple[int, int], layers_bottom_to_top: list[Layer], composite: Image.Image) -> None:
    width, height = canvas_size
    composite = composite.convert("RGB")
    layer_records = bytearray()
    layer_channel_payloads: list[bytes] = []

    for layer in layers_bottom_to_top:
        rgba = layer.image.convert("RGBA")
        r, g, b, a = rgba.split()
        channels = [(0, r), (1, g), (2, b), (-1, a)]

        layer_records += u32(layer.top)
        layer_records += u32(layer.left)
        layer_records += u32(layer.bottom)
        layer_records += u32(layer.right)
        layer_records += u16(len(channels))

        payloads_for_layer: list[bytes] = []
        for channel_id, plane in channels:
            payload = u16(0) + plane.tobytes()
            payloads_for_layer.append(payload)
            layer_records += i16(channel_id)
            layer_records += u32(len(payload))

        layer_records += b"8BIM"
        layer_records += b"norm"
        layer_records += bytes([255, 0, 0, 0])

        extra = bytearray()
        extra += u32(0)
        extra += u32(0)
        extra += psd_pascal_string(layer.name)
        layer_records += u32(len(extra))
        layer_records += extra
        layer_channel_payloads.extend(payloads_for_layer)

    layer_info = bytearray()
    layer_info += i16(len(layers_bottom_to_top))
    layer_info += layer_records
    for payload in layer_channel_payloads:
        layer_info += payload
    if len(layer_info) % 2:
        layer_info += b"\0"

    layer_and_mask = bytearray()
    layer_and_mask += u32(len(layer_info))
    layer_and_mask += layer_info
    layer_and_mask += u32(0)
    if len(layer_and_mask) % 2:
        layer_and_mask += b"\0"

    r, g, b = composite.split()
    with path.open("wb") as f:
        f.write(b"8BPS")
        f.write(u16(1))
        f.write(b"\0" * 6)
        f.write(u16(3))
        f.write(u32(height))
        f.write(u32(width))
        f.write(u16(8))
        f.write(u16(3))
        f.write(u32(0))
        f.write(u32(0))
        f.write(u32(len(layer_and_mask)))
        f.write(layer_and_mask)
        f.write(u16(0))
        f.write(r.tobytes())
        f.write(g.tobytes())
        f.write(b.tobytes())


def crop_box(source: Image.Image, box: tuple[int, int, int, int]) -> Image.Image:
    return source.crop(box).convert("RGBA")


def transparent_from_light_background(
    crop: Image.Image,
    low: float = 9.0,
    high: float = 44.0,
    dark: int = 246,
    sat_min: int = 22,
) -> Image.Image:
    rgb = np.asarray(crop.convert("RGB")).astype(np.int16)
    luma = (0.299 * rgb[:, :, 0] + 0.587 * rgb[:, :, 1] + 0.114 * rgb[:, :, 2]).astype(np.float32)
    sat = rgb.max(axis=2) - rgb.min(axis=2)

    light_bg = (luma > 225) & (sat < 38)
    if np.count_nonzero(light_bg) > 32:
        bg = np.median(rgb[light_bg], axis=0)
    else:
        border = np.concatenate([rgb[0, :, :], rgb[-1, :, :], rgb[:, 0, :], rgb[:, -1, :]], axis=0)
        bg = np.median(border, axis=0)

    diff = np.sqrt(np.sum((rgb.astype(np.float32) - bg.astype(np.float32)) ** 2, axis=2))
    alpha = ((diff - low) / max(1.0, high - low) * 255.0).clip(0, 255)
    strong = (luma < dark) | ((sat > sat_min) & (diff > low * 0.7))
    alpha = np.maximum(alpha, strong.astype(np.float32) * 210)
    alpha[alpha < 28] = 0
    alpha_img = Image.fromarray(alpha.astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(0.35))
    out = crop.convert("RGBA")
    out.putalpha(alpha_img)
    return out


def transparent_plant(crop: Image.Image) -> Image.Image:
    rgb = np.asarray(crop.convert("RGB")).astype(np.int16)
    height, width = rgb.shape[:2]
    yy, xx = np.indices((height, width))
    luma = (0.299 * rgb[:, :, 0] + 0.587 * rgb[:, :, 1] + 0.114 * rgb[:, :, 2]).astype(np.float32)
    sat = rgb.max(axis=2) - rgb.min(axis=2)
    green_bias = rgb[:, :, 1] - np.maximum(rgb[:, :, 0], rgb[:, :, 2])
    border = np.concatenate([rgb[0, :, :], rgb[-1, :, :], rgb[:, 0, :], rgb[:, -1, :]], axis=0)
    bg = np.median(border, axis=0)
    diff = np.sqrt(np.sum((rgb.astype(np.float32) - bg.astype(np.float32)) ** 2, axis=2))
    green_leaf = (green_bias > 6) & (sat > 9) & (luma < 252)
    muted_leaf = (green_bias > -3) & (sat > 18) & (luma < 232) & (diff > 18)
    pot_region = (xx > width * 0.46) & (yy > height * 0.50) & (luma < 238) & (sat < 62) & (diff > 12)
    plant_like = green_leaf | muted_leaf | pot_region
    alpha = ((diff - 18.0) / 58.0 * 180.0).clip(0, 180)
    alpha = np.maximum(alpha, plant_like.astype(np.float32) * 238)
    alpha[alpha < 52] = 0
    alpha_img = Image.fromarray(alpha.astype(np.uint8), "L").filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(0.7))
    out = crop.convert("RGBA")
    out.putalpha(alpha_img)
    return out


def apply_rounded_mask(img: Image.Image, radius: int) -> Image.Image:
    mask = Image.new("L", img.size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, img.width - 1, img.height - 1), radius=radius, fill=255)
    out = img.convert("RGBA")
    out.putalpha(ImageChops.multiply(out.getchannel("A"), mask))
    return out


def apply_circle_mask(img: Image.Image) -> Image.Image:
    mask = Image.new("L", img.size, 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((0, 0, img.width - 1, img.height - 1), fill=255)
    out = img.convert("RGBA")
    out.putalpha(ImageChops.multiply(out.getchannel("A"), mask))
    return out


def panel_asset(
    size: tuple[int, int],
    rect: tuple[int, int, int, int],
    radius: int,
    fill: tuple[int, int, int, int] = (255, 255, 255, 248),
    shadow_alpha: int = 28,
    shadow_blur: float = 12.0,
    shadow_offset: tuple[int, int] = (0, 7),
) -> Image.Image:
    shadow = Image.new("RGBA", size, (0, 0, 0, 0))
    smask = Image.new("L", size, 0)
    sdraw = ImageDraw.Draw(smask)
    sx, sy = shadow_offset
    sdraw.rounded_rectangle((rect[0] + sx, rect[1] + sy, rect[2] + sx, rect[3] + sy), radius=radius, fill=shadow_alpha)
    if shadow_blur:
        smask = smask.filter(ImageFilter.GaussianBlur(shadow_blur))
    shadow.putalpha(smask)

    body = Image.new("RGBA", size, (0, 0, 0, 0))
    bdraw = ImageDraw.Draw(body)
    bdraw.rounded_rectangle(rect, radius=radius, fill=fill)
    return Image.alpha_composite(shadow, body)


def nav_bar_asset(width: int, height: int, fill: tuple[int, int, int, int] = (255, 255, 255, 247)) -> Image.Image:
    img = Image.new("RGBA", (width, height), fill)
    top_shadow = Image.new("L", (width, height), 0)
    draw = ImageDraw.Draw(top_shadow)
    draw.rectangle((0, 0, width, min(10, height)), fill=16)
    top_shadow = top_shadow.filter(ImageFilter.GaussianBlur(7))
    shade = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    shade.putalpha(top_shadow)
    return Image.alpha_composite(shade, img)


def build_generated_layer(spec: dict[str, Any]) -> Layer:
    left, top, right, bottom = box_from_spec(spec)
    width, height = right - left, bottom - top
    layer_type = spec.get("type")
    name = str(spec["name"])

    if layer_type == "panel":
        rect = spec.get("rect", [0, 0, width - 1, height - 1])
        img = panel_asset(
            (width, height),
            rect=tuple(int(v) for v in rect),
            radius=int(spec.get("radius", 12)),
            fill=as_rgba(spec.get("fill", [255, 255, 255, 248])),
            shadow_alpha=int(spec.get("shadow_alpha", 28)),
            shadow_blur=float(spec.get("shadow_blur", 12.0)),
            shadow_offset=tuple(int(v) for v in spec.get("shadow_offset", [0, 7])),
        )
        return Layer(name, img, left, top, "generated_panel")

    if layer_type == "nav-bar":
        img = nav_bar_asset(width, height, as_rgba(spec.get("fill", [255, 255, 255, 247])))
        return Layer(name, img, left, top, "generated_nav")

    if layer_type == "solid":
        img = Image.new("RGBA", (width, height), as_rgba(spec.get("fill", [255, 255, 255, 255])))
        radius = int(spec.get("radius", 0))
        if radius:
            img = apply_rounded_mask(img, radius)
        return Layer(name, img, left, top, "generated_solid")

    raise ValueError(f"Unsupported generated layer type: {layer_type}")


def build_crop_layer(source: Image.Image, spec: dict[str, Any]) -> Layer:
    left, top, _, _ = box_from_spec(spec)
    crop = crop_box(source, box_from_spec(spec))
    extract = str(spec.get("extract", "raw"))
    name = str(spec["name"])

    if extract in ("raw", "solid"):
        img = crop
    elif extract in ("nonbg", "light-bg"):
        img = transparent_from_light_background(
            crop,
            low=float(spec.get("low", 9.0)),
            high=float(spec.get("high", 44.0)),
            dark=int(spec.get("dark", 246)),
            sat_min=int(spec.get("sat_min", 22)),
        )
    elif extract == "plant":
        img = transparent_plant(crop)
    elif extract == "circle":
        img = apply_circle_mask(crop)
    elif extract == "photo":
        img = crop
        radius = int(spec.get("radius", 0))
        if radius:
            img = apply_rounded_mask(img, radius)
    else:
        raise ValueError(f"Unsupported extract mode for {name}: {extract}")

    return Layer(name, img, left, top, extract)


def build_foreground_layers(source: Image.Image, config: dict[str, Any]) -> list[Layer]:
    layers = []
    for spec in config.get("layers", []):
        if "name" not in spec:
            raise ValueError(f"Layer spec missing name: {spec}")
        if spec.get("type") in ("panel", "nav-bar", "solid"):
            layers.append(build_generated_layer(spec))
        else:
            layers.append(build_crop_layer(source, spec))
    return layers


def make_background(source: Image.Image, bg_spec: dict[str, Any], foreground_by_name: dict[str, Layer]) -> Image.Image:
    width, height = source.size
    mode = str(bg_spec.get("mode", "source"))

    if mode == "source":
        return source.convert("RGBA")

    if mode == "solid":
        return Image.new("RGBA", (width, height), as_rgba(bg_spec.get("fill", [250, 252, 247, 255])))

    if mode != "clean":
        raise ValueError(f"Unsupported background mode: {mode}")

    base = source.convert("RGB")
    mask = Image.new("L", (width, height), 0)
    draw = ImageDraw.Draw(mask)
    pad = int(bg_spec.get("pad", 3))
    for item in bg_spec.get("masks", []):
        left, top, right, bottom = [int(v) for v in item["box"]]
        draw.rectangle((max(0, left - pad), max(0, top - pad), min(width, right + pad), min(height, bottom + pad)), fill=255)

    for layer_name in bg_spec.get("alpha_from_layers", []):
        if layer_name not in foreground_by_name:
            raise ValueError(f"background.alpha_from_layers references missing layer: {layer_name}")
        layer = foreground_by_name[layer_name]
        shaped = layer.image.getchannel("A").filter(ImageFilter.MaxFilter(11)).filter(ImageFilter.GaussianBlur(4))
        layer_mask = Image.new("L", (width, height), 0)
        layer_mask.paste(shaped, (layer.left, layer.top))
        mask = ImageChops.lighter(mask, layer_mask)

    blurred = base.filter(ImageFilter.GaussianBlur(float(bg_spec.get("blur", 42))))
    tint_color = as_rgb(bg_spec.get("fill", [250, 252, 247]))
    tint = Image.new("RGB", (width, height), tint_color)
    replacement = Image.blend(blurred, tint, float(bg_spec.get("tint", 0.78)))
    soft_mask = mask.filter(ImageFilter.GaussianBlur(float(bg_spec.get("mask_blur", 8))))
    bg = base.copy()
    bg.paste(replacement, (0, 0), soft_mask)

    overlay = bg.convert("RGBA")
    for deco in bg_spec.get("decorations", []):
        deco_layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        d = ImageDraw.Draw(deco_layer)
        shape = deco.get("shape", "ellipse")
        box = tuple(int(v) for v in deco["box"])
        fill = as_rgba(deco.get("fill", [255, 255, 255, 0]))
        if shape == "ellipse":
            d.ellipse(box, fill=fill)
        elif shape == "rectangle":
            d.rectangle(box, fill=fill)
        else:
            raise ValueError(f"Unsupported decoration shape: {shape}")
        blur = float(deco.get("blur", 0))
        if blur:
            deco_layer = deco_layer.filter(ImageFilter.GaussianBlur(blur))
        overlay = Image.alpha_composite(overlay, deco_layer)

    return overlay


def composite_layers(canvas_size: tuple[int, int], layers_bottom_to_top: list[Layer]) -> Image.Image:
    canvas = Image.new("RGBA", canvas_size, (0, 0, 0, 0))
    for layer in layers_bottom_to_top:
        canvas.alpha_composite(layer.image.convert("RGBA"), (layer.left, layer.top))
    return canvas


def save_assets(out_dir: Path, basename: str, layers: list[Layer], source: Path) -> tuple[Path, list[dict[str, Any]]]:
    layers_dir = out_dir / f"{basename}_layers"
    if layers_dir.exists():
        shutil.rmtree(layers_dir)
    layers_dir.mkdir(parents=True, exist_ok=True)

    manifest_layers = []
    for layer in layers:
        filename = f"{layer.name}.png"
        path = layers_dir / filename
        layer.image.save(path)
        manifest_layers.append(
            {
                "name": layer.name,
                "file": f"{layers_dir.name}/{filename}",
                "left": layer.left,
                "top": layer.top,
                "right": layer.right,
                "bottom": layer.bottom,
                "width": layer.width,
                "height": layer.height,
                "kind": layer.kind,
                "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            }
        )

    manifest = {
        "source": str(source),
        "canvas": {"width": layers[0].image.width if layers else 0, "height": layers[0].image.height if layers else 0},
        "layer_order": "bottom_to_top",
        "layers": manifest_layers,
    }
    manifest_path = out_dir / f"{basename}_layers_manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return manifest_path, manifest_layers


def write_zip(zip_path: Path, out_dir: Path, manifest_path: Path, manifest_layers: list[dict[str, Any]]) -> None:
    if zip_path.exists():
        zip_path.unlink()
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        zf.write(manifest_path, manifest_path.name)
        for entry in manifest_layers:
            layer_path = out_dir / entry["file"]
            zf.write(layer_path, entry["file"])


def validate_outputs(psd_path: Path, zip_path: Path, manifest_path: Path, preview_path: Path) -> dict[str, Any]:
    with Image.open(psd_path) as psd:
        psd.load()
        psd_probe = {"format": psd.format, "size": list(psd.size), "mode": psd.mode}
    with Image.open(preview_path) as preview:
        preview_probe = {"size": list(preview.size), "mode": preview.mode}
    with zipfile.ZipFile(zip_path) as zf:
        bad = zf.testzip()
        zip_probe = {"entries": len(zf.namelist()), "bad_entry": bad}
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    return {
        "psd": psd_probe,
        "preview": preview_probe,
        "zip": zip_probe,
        "manifest_layers": len(manifest.get("layers", [])),
    }


def load_config(config_path: Path) -> dict[str, Any]:
    data = json.loads(config_path.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or not isinstance(data.get("layers"), list):
        raise ValueError("Config must be an object with a layers array.")
    return data


def run(source_path: Path, config_path: Path, out_dir: Path, basename_arg: str | None) -> dict[str, Any]:
    source = Image.open(source_path).convert("RGB")
    config = load_config(config_path)
    basename = basename_arg or str(config.get("basename", source_path.stem))
    out_dir.mkdir(parents=True, exist_ok=True)

    foreground = build_foreground_layers(source, config)
    foreground_by_name = {layer.name: layer for layer in foreground}
    bg_spec = config.get("background", {"mode": "source", "name": "00_background"})
    bg_name = str(bg_spec.get("name", "00_background"))
    background = Layer(bg_name, make_background(source, bg_spec, foreground_by_name), 0, 0, "background")
    layers = [background] + foreground

    manifest_path, manifest_layers = save_assets(out_dir, basename, layers, source_path)
    preview_path = out_dir / f"{basename}_layered_preview.png"
    psd_path = out_dir / f"{basename}_editable.psd"
    zip_path = out_dir / f"{basename}_layer_assets.zip"

    preview = composite_layers(source.size, layers)
    preview.convert("RGB").save(preview_path)
    write_layered_psd(psd_path, source.size, layers, source)
    write_zip(zip_path, out_dir, manifest_path, manifest_layers)

    return {
        "psd": str(psd_path),
        "zip": str(zip_path),
        "preview": str(preview_path),
        "manifest": str(manifest_path),
        "layers_dir": str(out_dir / f"{basename}_layers"),
        "layer_count": len(layers),
        "validation": validate_outputs(psd_path, zip_path, manifest_path, preview_path),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Split a flat poster/screenshot into positioned PSD layers and zipped PNG assets.")
    parser.add_argument("--source", required=True, type=Path, help="Source image path.")
    parser.add_argument("--config", required=True, type=Path, help="Layer config JSON path.")
    parser.add_argument("--out", required=True, type=Path, help="Output directory.")
    parser.add_argument("--basename", default=None, help="Output basename. Defaults to config.basename or source stem.")
    args = parser.parse_args()

    try:
        result = run(args.source, args.config, args.out, args.basename)
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
