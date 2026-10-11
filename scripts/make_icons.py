"""Draws the Recurra logo: the forgetting curve, lifted by each review.
Memory fades (the curve drops), a review lifts it back up, and each fade is gentler
than the last, ending in a dot: knowledge that stays. White on calm teal.
Run: python3 scripts/make_icons.py → assets/icons/*, assets/android-res/**, src/logo.svg"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
TEAL = (47, 111, 115, 255)
WHITE = (251, 252, 252, 255)
S = 1024  # master size

# The mark in a 64×64 box: three decays, each flatter, joined by review "lifts", then a dot.
P0 = (12, 20)
CURVES = [((16, 33), (19, 41), (25, 43)), ((30, 31), (34, 35), (39, 36)), ((44, 26), (48, 27.5), (52, 28))]
LIFTS = [(25, 22), (39, 22)]
DOT, DOT_R, STROKE = (52, 28), 4.4, 4.4
SVG_PATH = 'M12 20C16 33 19 41 25 43L25 22C30 31 34 35 39 36L39 22C44 26 48 27.5 52 28'
CENTER = (33.5, 31.5)   # visual centre of the mark in design units


def bezier(p0, p1, p2, p3, n=60):
    out = []
    for i in range(n + 1):
        t = i / n
        a, b, c, d = (1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t ** 2, t ** 3
        out.append((a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]))
    return out


def mark_points():
    pts, cur = [P0], P0
    for i, (c1, c2, end) in enumerate(CURVES):
        pts.extend(bezier(cur, c1, c2, end)[1:]); cur = end
        if i < len(LIFTS):
            pts.append(LIFTS[i]); cur = LIFTS[i]
    return pts


def draw_mark(img, cx, cy, size, color):
    k = size / 64
    tx = lambda p: (cx + (p[0] - CENTER[0]) * k, cy + (p[1] - CENTER[1]) * k)
    d = ImageDraw.Draw(img)
    pts = [tx(p) for p in mark_points()]
    w = max(2, round(STROKE * k))
    d.line(pts, fill=color, width=w, joint='curve')
    r = w / 2
    for p in [P0, (25, 43), (25, 22), (39, 36), (39, 22)]:   # round caps and corners
        x, y = tx(p); d.ellipse([x - r, y - r, x + r, y + r], fill=color)
    x, y = tx(DOT); dr = DOT_R * k
    d.ellipse([x - dr, y - dr, x + dr, y + dr], fill=color)


def make(size, bg=True, mark_scale=0.9, radius=0.23, full_bg=False, color=WHITE):
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if bg:
        if full_bg: d.rectangle([0, 0, S, S], fill=TEAL)
        else: d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * radius), fill=TEAL)
    draw_mark(img, S / 2, S / 2, S * mark_scale, color)
    return img.resize((size, size), Image.LANCZOS)


def main():
    icons = ROOT / 'assets' / 'icons'
    icons.mkdir(parents=True, exist_ok=True)
    make(192).save(icons / 'icon-192.png')
    make(512).save(icons / 'icon-512.png')
    make(512, full_bg=True, mark_scale=0.66).save(icons / 'maskable-512.png')
    make(96, bg=False, mark_scale=1.15).save(icons / 'badge-96.png')
    make(48).save(icons / 'favicon-48.png')

    res = ROOT / 'assets' / 'android-res'
    for name, k in {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}.items():
        out = res / f'mipmap-{name}'
        out.mkdir(parents=True, exist_ok=True)
        make(int(48 * k)).save(out / 'ic_launcher.png')
        circ = make(int(48 * k), full_bg=True, mark_scale=0.72)
        m = Image.new('L', circ.size, 0)
        ImageDraw.Draw(m).ellipse([0, 0, circ.size[0] - 1, circ.size[1] - 1], fill=255)
        circ.putalpha(m)
        circ.save(out / 'ic_launcher_round.png')
        make(int(108 * k), bg=False, mark_scale=0.6).save(out / 'ic_launcher_foreground.png')
    (res / 'values').mkdir(parents=True, exist_ok=True)
    (res / 'values' / 'ic_launcher_background.xml').write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#1B93C9</color>\n</resources>\n')
    (res / 'drawable').mkdir(parents=True, exist_ok=True)
    (res / 'drawable' / 'ic_launcher_gradient.xml').write_text('''<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <gradient android:angle="315" android:startColor="#10A58F" android:centerColor="#1B93C9" android:endColor="#3A7BE6" android:type="linear"/>
</shape>
''')
    (res / 'mipmap-anydpi-v26').mkdir(parents=True, exist_ok=True)
    for n in ('ic_launcher.xml', 'ic_launcher_round.xml'):
        (res / 'mipmap-anydpi-v26' / n).write_text('''<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_gradient"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
''')
    (res / 'drawable' / 'ic_stat_notify.xml').write_text(f'''<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp" android:height="24dp" android:viewportWidth="64" android:viewportHeight="64">
    <group android:translateX="0" android:translateY="0.5">
        <path android:strokeColor="#FFFFFFFF" android:strokeWidth="6.5" android:strokeLineCap="round" android:strokeLineJoin="round"
            android:fillColor="#00000000" android:pathData="{SVG_PATH}"/>
        <path android:fillColor="#FFFFFFFF" android:pathData="M52,28m-5.6,0a5.6,5.6 0,1 1,11.2 0a5.6,5.6 0,1 1,-11.2 0"/>
    </group>
</vector>
''')
    # same mark for the website; colours come from the theme
    (ROOT / 'src' / 'logo.svg').write_text(f'''<svg class="logo" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs><linearGradient id="rcg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#10a58f"/><stop offset=".55" stop-color="#1b93c9"/><stop offset="1" stop-color="#3a7be6"/></linearGradient></defs>
  <rect width="64" height="64" rx="15" fill="url(#rcg)"/>
  <g transform="translate({32 - CENTER[0]} {32 - CENTER[1]})">
    <path d="{SVG_PATH}" fill="none" stroke="#ffffff" stroke-width="{STROKE}" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="{DOT[0]}" cy="{DOT[1]}" r="{DOT_R}" fill="#ffffff"/>
  </g>
</svg>
''')
    print('logo and icons written')


if __name__ == '__main__':
    main()
