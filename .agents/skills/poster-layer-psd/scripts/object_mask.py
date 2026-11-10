from __future__ import annotations

import hashlib
import shutil
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageOps


def infer_mask(crop: Image.Image) -> Image.Image:
    scripts = Path(__file__).resolve().parent
    web = scripts.parents[3] / "web"
    resources = web / "public/background-removal/1.7.0/data"
    runtime = web / "public/background-removal/1.7.0/object-runtime"
    if not runtime.is_dir():
        runtime = web / "node_modules/onnxruntime-web/dist"
    node = next((str(path) for path in (web / "node.exe", web / "node") if path.is_file()), None) or shutil.which("node")
    if not node or not (resources / "resources.json").is_file() or not (runtime / "ort.wasm.bundle.min.mjs").is_file():
        raise ValueError("主体分割需要内置 Node 和离线抠图资源，请先准备 background-removal 资源")

    key = hashlib.sha256(b"isnet-fp16-v1" + str(crop.size).encode() + crop.tobytes()).hexdigest()
    cache = Path(tempfile.gettempdir()) / "poster-layer-psd-masks"
    cache.mkdir(exist_ok=True)
    cached = cache / f"{key}.png"
    if cached.is_file():
        with Image.open(cached) as image:
            return image.convert("L")

    with tempfile.TemporaryDirectory(prefix="poster-object-") as task_dir:
        task = Path(task_dir)
        rgb = np.asarray(crop.convert("RGB").resize((1024, 1024), Image.Resampling.BILINEAR), dtype=np.float32)
        ((rgb - 128) / 256).transpose(2, 0, 1).copy().tofile(task / "input.bin")
        result = subprocess.run(
            [node, str(scripts / "segment_object.mjs"), str(task / "input.bin"), str(task / "mask.bin"), str(resources), str(runtime)],
            capture_output=True, timeout=120,
        )
        if result.returncode:
            raise ValueError("主体分割失败：" + result.stderr.decode("utf-8", errors="replace")[-1500:])
        prediction = np.fromfile(task / "mask.bin", dtype=np.float32).reshape((1024, 1024))
        mask = Image.fromarray(np.clip(prediction * 255, 0, 255).astype(np.uint8)).resize(crop.size, Image.Resampling.BILINEAR)
        mask.save(cached)
        return mask


def apply_object_mask(crop: Image.Image, prediction: Image.Image, plant: bool = False, foreground_polygon: list | None = None) -> Image.Image:
    rgb = np.asarray(crop.convert("RGB"), dtype=np.float32)
    border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    bins = border // 16
    colors, counts = np.unique(bins, axis=0, return_counts=True)
    background = np.median(border[np.all(bins == colors[counts.argmax()], axis=1)], axis=0)
    confidence = np.asarray(prediction)
    if plant:
        # Pale leaves can have low model confidence. Recover them from their
        # contrast to the uniform background, without making the pot translucent.
        distance = np.sqrt(np.sum((rgb - background) ** 2, axis=2))
        silhouette = Image.fromarray(((confidence >= 217) | (distance >= 75)).astype(np.uint8) * 255)
        silhouette = ImageChops.lighter(silhouette, silhouette.filter(ImageFilter.ModeFilter(5)))
    else:
        silhouette = prediction.point(lambda value: 255 if value >= 128 else 0)
        padded = ImageOps.expand(silhouette, border=1, fill=0)
        ImageDraw.floodfill(padded, (0, 0), 128)
        silhouette = Image.fromarray(np.where(np.asarray(padded) == 128, 0, 255).astype(np.uint8)).crop((1, 1, crop.width + 1, crop.height + 1))
    if foreground_polygon:
        ImageDraw.Draw(silhouette).polygon([tuple(point) for point in foreground_polygon], fill=255)
    silhouette = silhouette.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))
    alpha = silhouette.filter(ImageFilter.BoxBlur(0.5))
    if plant:
        fraction = np.asarray(alpha, dtype=np.float32) / 255
        edge = (fraction > 0) & (fraction < 1)
        rgb[edge] = np.clip((rgb[edge] - background * (1 - fraction[edge, None])) / fraction[edge, None], 0, 255)
    out = Image.fromarray(rgb.astype(np.uint8)).convert("RGBA")
    out.putalpha(ImageChops.multiply(crop.convert("RGBA").getchannel("A"), alpha))
    return out


def extract_object(crop: Image.Image, plant: bool = False, foreground_polygon: list | None = None) -> Image.Image:
    return apply_object_mask(crop, infer_mask(crop), plant, foreground_polygon)
