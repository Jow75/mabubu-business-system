# Makes every NAS Mabubu System icon and logo file from the owner's logo
# (assets/brand/nas-mabubu-logo.png, kept exactly as supplied). The artwork is
# only resized — never redrawn, cropped or recoloured. Where a file must be
# larger than the artwork (the maskable icon, whose corners a phone may cut
# off), the logo's own background blue fills the extra space.
#
# Needs Python 3 with Pillow:  python scripts/make-brand-icons.py
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'assets' / 'brand' / 'nas-mabubu-logo.png'
OUT = ROOT / 'public' / 'brand'
# Sampled from the logo's edges (all within ±4 of this).
BACKGROUND = (0, 90, 249)
# Android may cut a maskable icon down to the circle of 40 % of its size around
# the centre. The artwork reaches 606/1254 of the width from the centre, so at
# 82 % it stays inside that circle with room to spare.
MASKABLE_SCALE = 0.82


def resized(img: Image.Image, size: int) -> Image.Image:
    return img.resize((size, size), Image.Resampling.LANCZOS)


def save_png(img: Image.Image, name: str) -> None:
    path = OUT / name
    img.save(path, 'PNG', optimize=True)
    print(f'{name}: {img.size[0]}x{img.size[1]}, {path.stat().st_size // 1024} KB')


def main() -> None:
    logo = Image.open(SRC).convert('RGB')
    assert logo.size[0] == logo.size[1], 'the logo is square'
    OUT.mkdir(parents=True, exist_ok=True)
    # On screens: the header and the sign-in page (up to 52 px, sharp at 2x).
    save_png(resized(logo, 128), 'nas-logo-128.png')
    # In printable reports (PDF, Word, Excel): about 2.3 cm wide at 300 dpi.
    save_png(resized(logo, 280), 'nas-logo-report.png')
    # Browser tab, home screen and installed-app icons.
    save_png(resized(logo, 32), 'favicon-32.png')
    save_png(resized(logo, 180), 'apple-touch-icon.png')
    save_png(resized(logo, 192), 'icon-192.png')
    save_png(resized(logo, 512), 'icon-512.png')
    inner = round(512 * MASKABLE_SCALE)
    canvas = Image.new('RGB', (512, 512), BACKGROUND)
    canvas.paste(resized(logo, inner), ((512 - inner) // 2, (512 - inner) // 2))
    save_png(canvas, 'icon-maskable-512.png')


if __name__ == '__main__':
    main()
