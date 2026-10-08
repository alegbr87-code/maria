#!/usr/bin/env python3
"""Genera le icone PNG per la PWA "Maria" (coerenti con icons/icon.svg).

Uso:  python3 tools/make_icons.py
Richiede: Pillow  (pip install pillow)
"""
import math
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "icons")
os.makedirs(OUT, exist_ok=True)

# --- colori ---
BG_TOP = (18, 42, 31)
BG_BOT = (11, 20, 16)
GLOW = (55, 214, 122)
LEAF_TOP = (182, 236, 108)
LEAF_BOT = (31, 157, 85)


def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def vertical_gradient(size, top, bottom):
    img = Image.new("RGB", (1, size), top)
    px = img.load()
    for y in range(size):
        px[0, y] = lerp(top, bottom, y / (size - 1))
    return img.resize((size, size), Image.BILINEAR)


def radial_glow(size, center, radius, color, max_alpha):
    img = Image.new("L", (size, size), 0)
    px = img.load()
    cx, cy = center
    for y in range(size):
        for x in range(size):
            d = math.hypot(x - cx, y - cy) / radius
            if d < 1:
                px[x, y] = int(max_alpha * (1 - d) ** 1.5)
    layer = Image.new("RGB", (size, size), color)
    return layer, img


def leaflet_polygon(cx, cy, angle_deg, length, halfwidth, steps=40):
    a = math.radians(angle_deg)
    dx, dy = math.sin(a), -math.cos(a)
    px, py = math.cos(a), math.sin(a)
    up, down = [], []
    for i in range(steps + 1):
        t = i / steps
        w = halfwidth * math.sin(math.pi * t)
        bxp, byp = cx + dx * length * t, cy + dy * length * t
        up.append((bxp + px * w, byp + py * w))
        down.append((bxp - px * w, byp - py * w))
    return up + down[::-1]


def make_icon(size, rounded=True, leaf_scale=1.0, full_bleed=False):
    S = size
    # sfondo
    if full_bleed:
        bg = vertical_gradient(S, BG_TOP, BG_BOT).convert("RGBA")
    else:
        grad = vertical_gradient(S, BG_TOP, BG_BOT).convert("RGBA")
        mask = Image.new("L", (S, S), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=255)
        bg = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        bg.paste(grad, (0, 0), mask)

    # alone
    glow_layer, glow_alpha = radial_glow(S, (S / 2, S * 0.42), S * 0.62, GLOW, 90)
    bg = Image.alpha_composite(bg, Image.merge("RGBA", (*glow_layer.split(), glow_alpha)))

    # foglia
    leaf_mask = Image.new("L", (S, S), 0)
    ld = ImageDraw.Draw(leaf_mask)
    cx, cy = S / 2, S * 0.70
    base = S * 0.44 * leaf_scale
    for ang, sc in [(0, 1.0), (32, 0.9), (-32, 0.9), (60, 0.78), (-60, 0.78), (86, 0.62), (-86, 0.62)]:
        L = base * sc
        w = base * 0.175 * sc
        ld.polygon(leaflet_polygon(cx, cy, ang, L, w), fill=255)
    # gambo
    stem_w = max(1, int(S * 0.024))
    ld.rounded_rectangle([cx - stem_w / 2, cy, cx + stem_w / 2, cy + S * 0.18], radius=stem_w / 2, fill=255)

    leaf_grad = vertical_gradient(S, LEAF_TOP, LEAF_BOT).convert("RGBA")
    leaf_grad.putalpha(leaf_mask)
    img = Image.alpha_composite(bg, leaf_grad)
    return img


def arrow_mask(size):
    """Freccia verso l'alto (shaft + punta)."""
    S = size
    m = Image.new("L", (S, S), 0)
    d = ImageDraw.Draw(m)
    cx = S / 2
    # shaft
    sw = S * 0.13
    d.rounded_rectangle([cx - sw / 2, S * 0.34, cx + sw / 2, S * 0.76], radius=sw * 0.35, fill=255)
    # punta
    d.polygon([(cx, S * 0.10), (cx - S * 0.20, S * 0.40), (cx + S * 0.20, S * 0.40)], fill=255)
    return m


def make_logo(size, rounded=True, scale=1.0, full_bleed=False):
    S = size
    # sfondo
    if full_bleed:
        bg = vertical_gradient(S, BG_TOP, BG_BOT).convert("RGBA")
    else:
        grad = vertical_gradient(S, BG_TOP, BG_BOT).convert("RGBA")
        mask = Image.new("L", (S, S), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=255)
        bg = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        bg.paste(grad, (0, 0), mask)

    # alone
    glow_layer, glow_alpha = radial_glow(S, (S / 2, S * 0.42), S * 0.62, GLOW, 100)
    bg = Image.alpha_composite(bg, Image.merge("RGBA", (*glow_layer.split(), glow_alpha)))

    # foglie (germoglio) alla base
    leaf_mask = Image.new("L", (S, S), 0)
    ld = ImageDraw.Draw(leaf_mask)
    cx, cy = S / 2, S * 0.74
    base = S * 0.30 * scale
    for ang, sc in [(58, 1.0), (-58, 1.0), (84, 0.7), (-84, 0.7)]:
        ld.polygon(leaflet_polygon(cx, cy, ang, base * sc, base * 0.2 * sc), fill=255)
    leaf_grad = vertical_gradient(S, LEAF_TOP, LEAF_BOT).convert("RGBA")
    leaf_grad.putalpha(leaf_mask)

    # freccia
    am = arrow_mask(S)
    if scale != 1.0:
        am = am.resize((int(S * scale), int(S * scale)), Image.LANCZOS)
        tmp = Image.new("L", (S, S), 0)
        tmp.paste(am, ((S - am.width) // 2, (S - am.height) // 2))
        am = tmp
    arrow_grad = vertical_gradient(S, (208, 244, 130), (55, 214, 122)).convert("RGBA")
    arrow_grad.putalpha(am)

    # scie di velocità
    speed = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    sd = ImageDraw.Draw(speed)
    for (x, y, w, h) in [(S * 0.12, S * 0.30, S * 0.16, S * 0.035),
                         (S * 0.72, S * 0.30, S * 0.16, S * 0.035),
                         (S * 0.16, S * 0.44, S * 0.10, S * 0.03),
                         (S * 0.74, S * 0.44, S * 0.10, S * 0.03)]:
        sd.rounded_rectangle([x, y, x + w, y + h], radius=h / 2, fill=(168, 224, 95, 150))

    img = bg
    img = Image.alpha_composite(img, leaf_grad)
    img = Image.alpha_composite(img, speed)
    img = Image.alpha_composite(img, arrow_grad)
    return img


def save(img, name):
    path = os.path.join(OUT, name)
    img.save(path)
    print("scritto", path)


save(make_logo(512, rounded=True), "icon-512.png")
save(make_logo(192, rounded=True), "icon-192.png")
save(make_logo(512, full_bleed=True, scale=0.8), "icon-maskable-512.png")
save(make_logo(180, full_bleed=True, scale=0.94), "apple-touch-icon.png")
save(make_logo(32, rounded=True), "favicon-32.png")
print("Fatto.")
