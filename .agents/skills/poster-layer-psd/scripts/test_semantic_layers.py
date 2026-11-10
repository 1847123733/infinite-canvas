import importlib.util
import sys
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("poster_layer_psd", Path(__file__).with_name("poster_layer_psd.py"))
psd = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = psd
spec.loader.exec_module(psd)


class SemanticLayersTest(unittest.TestCase):
    def config(self):
        return {
            "strategy": "semantic-ui",
            "background": {"mode": "solid", "fill": [245, 248, 242]},
            "layers": [
                {"name": "card", "role": "container", "type": "solid", "fill": [255, 255, 255, 255], "box": [5, 5, 85, 75]},
                {"name": "water_badge", "role": "icon", "parent": "card", "extract": "circle", "box": [50, 20, 74, 44]},
            ],
        }

    def test_rejects_source_crop_as_semantic_container(self):
        config = self.config()
        config["layers"][0].pop("type")
        with self.assertRaisesRegex(ValueError, "container"):
            psd.build_foreground_layers(Image.new("RGB", (90, 80)), config)

    def test_rejects_partition_for_editable_ui(self):
        config = self.config()
        config["background"]["mode"] = "partition"
        with self.assertRaisesRegex(ValueError, "solid"):
            psd.build_foreground_layers(Image.new("RGB", (90, 80)), config)

    def test_hiding_badge_exposes_complete_card_and_keeps_icon_interior(self):
        source = Image.new("RGB", (90, 80), (255, 255, 255))
        source.paste((200, 230, 250), (50, 20, 74, 44))
        source.putpixel((62, 32), (255, 255, 255))
        config = self.config()
        foreground = psd.build_foreground_layers(source, config)
        background = psd.make_background(source, config["background"], {layer.name: layer for layer in foreground})
        base = psd.Layer("background", background, 0, 0, "background")
        hidden = psd.composite_layers(source.size, [base, foreground[0]])
        self.assertEqual(hidden.getpixel((62, 32)), (255, 255, 255, 255))
        self.assertEqual(hidden.getpixel((58, 28)), (255, 255, 255, 255))
        badge = foreground[1].image
        self.assertEqual(badge.getpixel((12, 12)), (255, 255, 255, 255))
        self.assertTrue(np.all(np.asarray(badge.getchannel("A"))[6:18, 6:18] == 255))
        self.assertEqual(badge.getpixel((0, 0))[3], 0)

    def test_circle_crop_expands_narrow_box_without_stretching(self):
        source = Image.new("RGB", (100, 100), (255, 255, 255))
        layer = psd.build_crop_layer(source, {"name": "disc", "box": [40, 30, 60, 70], "extract": "circle"})
        self.assertEqual((layer.left, layer.top, layer.width, layer.height), (30, 30, 40, 40))


if __name__ == "__main__":
    unittest.main()
