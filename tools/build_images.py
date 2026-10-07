#!/usr/bin/env python3
"""Cuts the web images in public/img and the favicons from assets/blue-bee-ops-logo.jpg.
Needs Pillow (pip install pillow). Only rerun when the logo changes; build_pages.py doesn't need it.
Run: python3 tools/build_images.py"""
import os
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SRC = os.path.join(ROOT, "assets", "blue-bee-ops-logo.jpg")
PUB = os.path.join(ROOT, "public")
IMG = os.path.join(PUB, "img")

# Gold ring center in the 1408px source; HALF leaves room for the wing tips that cross the ring.
CX, CY, HALF = 704, 630, 590

def save_pair(im, stem, quality):
    im.save(os.path.join(IMG, f"{stem}.webp"), quality=quality, method=6)
    im.save(os.path.join(IMG, f"{stem}.jpg"), quality=quality, optimize=True, progressive=True)

def circle(im, size):
    im = im.resize((size, size), Image.LANCZOS).convert("RGBA")
    mask = Image.new("L", (size * 4, size * 4), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size * 4 - 1, size * 4 - 1), fill=255)
    im.putalpha(mask.resize((size, size), Image.LANCZOS))
    return im

def og_image(src, w=1200, h=630):
    """Logo centered on a canvas whose side margins continue the logo's own edge colors."""
    logo = src.resize((h, h), Image.LANCZOS)
    x0 = (w - h) // 2
    left = logo.crop((0, 0, 1, h)).resize((x0, h))
    right = logo.crop((h - 1, 0, h, h)).resize((w - h - x0, h))
    canvas = Image.new("RGB", (w, h))
    canvas.paste(left.filter(ImageFilter.GaussianBlur(6)), (0, 0))
    canvas.paste(right.filter(ImageFilter.GaussianBlur(6)), (x0 + h, 0))
    canvas.paste(logo, (x0, 0))
    return canvas

def main():
    os.makedirs(IMG, exist_ok=True)
    src = Image.open(SRC).convert("RGB")
    emblem = src.crop((CX - HALF, CY - HALF, CX + HALF, CY + HALF))
    for size in (128, 512):
        save_pair(emblem.resize((size, size), Image.LANCZOS), f"emblem-{size}", 82)
    save_pair(src.resize((192, 192), Image.LANCZOS), "logo-192", 82)
    src.resize((640, 640), Image.LANCZOS).save(os.path.join(IMG, "logo-640.jpg"), quality=80, optimize=True, progressive=True)
    og_image(src).save(os.path.join(IMG, "og.jpg"), quality=80, optimize=True, progressive=True)
    emblem.resize((180, 180), Image.LANCZOS).quantize(colors=128, method=Image.Quantize.MEDIANCUT).save(
        os.path.join(PUB, "apple-touch-icon.png"), optimize=True)
    circle(emblem, 64).save(os.path.join(PUB, "favicon.png"), optimize=True)
    circle(emblem, 48).save(os.path.join(PUB, "favicon.ico"), sizes=[(48, 48), (32, 32), (16, 16)])
    print("wrote images from", os.path.relpath(SRC, ROOT))

if __name__ == "__main__":
    main()
