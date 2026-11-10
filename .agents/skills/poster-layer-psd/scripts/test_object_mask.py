import importlib.util
import sys
import unittest
from pathlib import Path

from PIL import Image, ImageDraw

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("object_mask", Path(__file__).with_name("object_mask.py"))
masker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(masker)


class ObjectMaskTest(unittest.TestCase):
    def test_plant_recovers_low_confidence_leaf_and_preserves_pale_pot(self):
        source = Image.new("RGBA", (80, 70), (249, 250, 247, 255))
        draw = ImageDraw.Draw(source)
        draw.ellipse((8, 12, 26, 26), fill=(180, 210, 135, 255))
        draw.rectangle((30, 35, 55, 68), fill=(248, 249, 245, 255))
        prediction = Image.new("L", source.size, 0)
        ImageDraw.Draw(prediction).ellipse((8, 12, 26, 26), fill=30)
        result = masker.apply_object_mask(source, prediction, True, [[30, 35], [55, 35], [55, 69], [30, 69]])
        self.assertEqual(result.getpixel((17, 19)), source.getpixel((17, 19)))
        self.assertEqual(result.getpixel((42, 50)), source.getpixel((42, 50)))
        self.assertEqual(result.getpixel((2, 2))[3], 0)

    def test_object_keeps_white_interior_despite_model_hole(self):
        source = Image.new("RGBA", (40, 40), (255, 255, 255, 255))
        prediction = Image.new("L", source.size, 0)
        draw = ImageDraw.Draw(prediction)
        draw.rectangle((8, 8, 31, 31), fill=255)
        draw.rectangle((16, 16, 23, 23), fill=0)
        result = masker.apply_object_mask(source, prediction)
        self.assertEqual(result.getpixel((20, 20)), (255, 255, 255, 255))
        self.assertEqual(result.getpixel((0, 0))[3], 0)


if __name__ == "__main__":
    unittest.main()
