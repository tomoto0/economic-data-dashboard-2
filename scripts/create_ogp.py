from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

out_dir = Path('/home/ubuntu/webdev-static-assets')
out_dir.mkdir(parents=True, exist_ok=True)
out = out_dir / 'economic-dashboard-ogp.png'

w, h = 1200, 630
img = Image.new('RGB', (w, h), '#020617')
draw = ImageDraw.Draw(img)

# Background gradients and grid
for y in range(h):
    r = int(2 + (12 * y / h))
    g = int(6 + (22 * y / h))
    b = int(23 + (48 * y / h))
    draw.line([(0, y), (w, y)], fill=(r, g, b))

for x in range(-100, w, 80):
    draw.line([(x, 0), (x + 260, h)], fill=(20, 45, 72), width=1)
for y in range(60, h, 80):
    draw.line([(0, y), (w, y)], fill=(15, 35, 58), width=1)

# Decorative glow circles
for radius, color, cx, cy in [
    (280, (12, 105, 145), 150, 90),
    (240, (59, 40, 130), 920, 120),
    (190, (10, 90, 80), 1020, 520),
]:
    for i in range(radius, 0, -8):
        alpha = i / radius
        col = tuple(int(c * alpha + 2 * (1-alpha)) for c in color)
        draw.ellipse((cx-i, cy-i, cx+i, cy+i), outline=col, width=2)

try:
    font_big = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 66)
    font_med = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 30)
    font_small = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 24)
except Exception:
    font_big = font_med = font_small = ImageFont.load_default()

# Chart panel
panel = (650, 140, 1100, 495)
draw.rounded_rectangle(panel, radius=32, fill=(8, 18, 38), outline=(34, 211, 238), width=2)
points = [(690, 420), (750, 365), (810, 390), (875, 300), (940, 335), (1000, 240), (1060, 265)]
draw.line(points, fill=(34, 211, 238), width=7)
for p in points:
    draw.ellipse((p[0]-8, p[1]-8, p[0]+8, p[1]+8), fill=(125, 211, 252))
points2 = [(690, 455), (750, 425), (810, 410), (875, 380), (940, 315), (1000, 330), (1060, 290)]
draw.line(points2, fill=(251, 146, 60), width=5)
for p in points2:
    draw.ellipse((p[0]-6, p[1]-6, p[0]+6, p[1]+6), fill=(251, 191, 36))

# Text
draw.text((80, 120), 'Global Economic', font=font_big, fill=(241, 245, 249))
draw.text((80, 198), 'Data Dashboard', font=font_big, fill=(103, 232, 249))
draw.text((84, 305), 'World Bank Open Data · Manus Database · AI Insights', font=font_med, fill=(203, 213, 225))

# Pills
pills = ['GDP', 'Population', 'Inflation', 'FDI', 'Reserves']
x = 84
for pill in pills:
    tw = draw.textlength(pill, font=font_small)
    draw.rounded_rectangle((x, 415, x + tw + 34, 462), radius=23, fill=(15, 35, 58), outline=(56, 189, 248), width=1)
    draw.text((x + 17, 425), pill, font=font_small, fill=(224, 242, 254))
    x += int(tw + 48)

img.save(out)
print(out)
