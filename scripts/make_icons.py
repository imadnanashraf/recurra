"""Draws the Recurra icon: an open book on a calm teal background, with three dots
spaced further and further apart (the idea of spaced repetition).
Run once: python3 scripts/make_icons.py  → assets/icons/*.png and assets/android-res/**"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
TEAL = (47, 111, 115, 255)
WHITE = (251, 252, 252, 255)
S = 1024  # master size


def book(draw, cx, cy, w, color):
    """open book: two pages meeting at a spine, gently curved tops"""
    h = w * 0.62
    left = [(cx, cy - h * 0.38), (cx - w * 0.06, cy - h * 0.46), (cx - w * 0.5, cy - h * 0.5),
            (cx - w * 0.5, cy + h * 0.42), (cx - w * 0.06, cy + h * 0.40), (cx, cy + h * 0.48)]
    right = [(2 * cx - x, y) for x, y in left]
    draw.polygon(left, fill=color)
    draw.polygon(right, fill=color)
    # spine gap
    draw.line([(cx, cy - h * 0.36), (cx, cy + h * 0.46)], fill=(0, 0, 0, 0), width=max(2, int(w * 0.035)))
    # spaced dots above the book
    r = w * 0.045
    xs = [cx - w * 0.30, cx - w * 0.17, cx + w * 0.06, cx + w * 0.40]
    for x in xs:
        draw.ellipse([x - r, cy - h * 0.82 - r, x + r, cy - h * 0.82 + r], fill=color)


def make(size, bg=True, scale=0.62, radius=0.22, color=WHITE, mask_bg=False):
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if bg:
        if mask_bg:
            d.rectangle([0, 0, S, S], fill=TEAL)
        else:
            d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * radius), fill=TEAL)
    layer = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    book(ImageDraw.Draw(layer), S / 2, S * 0.56, S * scale, color)
    img.alpha_composite(layer)
    return img.resize((size, size), Image.LANCZOS)


def main():
    icons = ROOT / 'assets' / 'icons'
    icons.mkdir(parents=True, exist_ok=True)
    make(192).save(icons / 'icon-192.png')
    make(512).save(icons / 'icon-512.png')
    make(512, mask_bg=True, scale=0.5).save(icons / 'maskable-512.png')
    make(96, bg=False, scale=0.8).save(icons / 'badge-96.png')

    res = ROOT / 'assets' / 'android-res'
    dens = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
    for name, k in dens.items():
        out = res / f'mipmap-{name}'
        out.mkdir(parents=True, exist_ok=True)
        make(int(48 * k)).save(out / 'ic_launcher.png')
        circ = make(int(48 * k), mask_bg=True)
        m = Image.new('L', circ.size, 0)
        ImageDraw.Draw(m).ellipse([0, 0, circ.size[0] - 1, circ.size[1] - 1], fill=255)
        circ.putalpha(m)
        circ.save(out / 'ic_launcher_round.png')
        make(int(108 * k), bg=False, scale=0.42).save(out / 'ic_launcher_foreground.png')
    (res / 'values').mkdir(parents=True, exist_ok=True)
    (res / 'values' / 'ic_launcher_background.xml').write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#2F6F73</color>\n</resources>\n')
    (res / 'drawable').mkdir(parents=True, exist_ok=True)
    # status-bar icon must be a single-colour shape: a simple open book
    (res / 'drawable' / 'ic_stat_notify.xml').write_text('''<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">
    <path android:fillColor="#FFFFFFFF"
        android:pathData="M11.3,6.6 L10.6,6.1 C8.4,5.1 5.6,4.8 3,5 L3,18.3 C5.6,18.1 8.4,18.4 10.6,19.4 L11.3,19.8 Z M12.7,6.6 L13.4,6.1 C15.6,5.1 18.4,4.8 21,5 L21,18.3 C18.4,18.1 15.6,18.4 13.4,19.4 L12.7,19.8 Z"/>
</vector>
''')
    print('icons written')


if __name__ == '__main__':
    main()
