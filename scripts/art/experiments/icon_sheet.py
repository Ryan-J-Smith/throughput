"""Icon-sheet extraction experiment: can a generated silhouette sheet (3x3 or 4x4) become game icons?

Offline only; nothing here is part of the build. Run from the repo root, naming a sheet in SHEETS
(default icon-sheet):

    uv run --with vtracer --with pillow --with numpy --with scipy python scripts/art/experiments/icon_sheet.py icon-sheet-2
    npx -y svgo@3.3.2 -q -f src/assets/art/experiments/icon-sheet-2/vector

Route (a) "cutout": alpha (or dark-pixel) mask -> connected components -> grouped into grid cells
by centroid -> trim, pad to a square with a margin, resize -> black-on-transparent PNG.
Route (b) "vector": the same cell mask, upscaled -> vtracer (binary, spline) -> SVG whose fill is
currentColor so CSS can tint it.
"""

from pathlib import Path
import re
import sys

import numpy as np
from PIL import Image
from scipy import ndimage
import vtracer

ROOT = Path.cwd()
# Each sheet's cell names, left to right and top to bottom; the grid is square.
SHEETS = {
    "icon-sheet": ["apparel", "gadgets", "home", "food", "design", "make", "ship", "coin", "truck"],
    "icon-sheet-2": [
        "hot", "emerging", "saturated", "neutral",
        "loyal", "buzz", "equity", "capital",
        "sales", "units", "margin", "retool",
        "scrap", "station", "mod", "robot-arm",
    ],
}
EDGE = 128
MARGIN = 0.08


def coverage(image: Image.Image) -> np.ndarray:
    """0..1 ink coverage: alpha when the sheet is transparent, else darkness."""
    rgba = np.asarray(image.convert("RGBA")).astype(np.float32) / 255
    alpha = rgba[..., 3]
    if alpha.min() < 0.5:
        return alpha
    luminance = rgba[..., :3] @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
    return 1 - luminance


def cells(ink: np.ndarray, grid: int) -> dict[int, tuple[int, int, int, int]]:
    """Bounding box (top, left, bottom, right) of the components whose centroid falls in each cell."""
    labels, count = ndimage.label(ink > 0.5)
    h, w = ink.shape
    boxes: dict[int, tuple[int, int, int, int]] = {}
    for index, region in enumerate(ndimage.find_objects(labels), start=1):
        if region is None:
            continue
        ys, xs = np.nonzero(labels[region] == index)
        if len(ys) < 40:  # specks
            continue
        cy = region[0].start + ys.mean()
        cx = region[1].start + xs.mean()
        cell = int(cy // (h / grid)) * grid + int(cx // (w / grid))
        top, left, bottom, right = region[0].start, region[1].start, region[0].stop, region[1].stop
        if cell in boxes:
            t, l, b, r = boxes[cell]
            boxes[cell] = (min(t, top), min(l, left), max(b, bottom), max(r, right))
        else:
            boxes[cell] = (top, left, bottom, right)
    print(f"{count} components -> {len(boxes)} cells")
    return boxes


def square(ink: np.ndarray, box: tuple[int, int, int, int]) -> np.ndarray:
    """The box's coverage centred on a square canvas with a margin."""
    top, left, bottom, right = box
    crop = ink[top:bottom, left:right]
    side = int(max(crop.shape) * (1 + 2 * MARGIN))
    canvas = np.zeros((side, side), dtype=np.float32)
    y = (side - crop.shape[0]) // 2
    x = (side - crop.shape[1]) // 2
    canvas[y : y + crop.shape[0], x : x + crop.shape[1]] = crop
    return canvas


def cutout(canvas: np.ndarray, path: Path) -> None:
    alpha = Image.fromarray((canvas * 255).astype(np.uint8)).resize((EDGE, EDGE), Image.LANCZOS)
    black = Image.new("RGBA", alpha.size, (31, 26, 20, 0))  # --print
    black.putalpha(alpha)
    black.save(path, optimize=True)


def vector(canvas: np.ndarray, path: Path) -> None:
    bitmap = Image.fromarray(np.where(canvas > 0.5, 0, 255).astype(np.uint8)).convert("RGB")
    scratch = path.with_suffix(".trace.png")
    bitmap.save(scratch)
    vtracer.convert_image_to_svg_py(
        str(scratch), str(path), colormode="binary", mode="spline", filter_speckle=8, corner_threshold=60, length_threshold=4.0, path_precision=2
    )
    scratch.unlink()
    side = canvas.shape[0]
    svg = path.read_text()
    svg = re.sub(r'fill="#[0-9A-Fa-f]{6}"', 'fill="currentColor"', svg)
    svg = re.sub(r'<svg[^>]*>', f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {side} {side}">', svg, count=1)
    path.write_text(svg)


def main(sheet: str) -> int:
    names = SHEETS.get(sheet)
    if names is None:
        print(f"unknown sheet {sheet}; one of {', '.join(SHEETS)}")
        return 1
    grid = int(len(names) ** 0.5)
    source = ROOT / f"scripts/art/raw/silhouettes/{sheet}.png"
    out = ROOT / f"src/assets/art/experiments/{sheet}"
    if not source.exists():
        print(f"missing {source}")
        return 1
    ink = coverage(Image.open(source))
    boxes = cells(ink, grid)
    for sub in ("cutout", "vector"):
        (out / sub).mkdir(parents=True, exist_ok=True)
    for cell, name in enumerate(names):
        box = boxes.get(cell)
        if box is None:
            print(f"cell {cell} ({name}): nothing found")
            continue
        canvas = square(ink, box)
        cutout(canvas, out / "cutout" / f"{cell + 1}-{name}.png")
        vector(canvas, out / "vector" / f"{cell + 1}-{name}.svg")
        print(f"cell {cell} ({name}): box {box}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "icon-sheet"))
