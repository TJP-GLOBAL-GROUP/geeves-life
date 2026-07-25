"""
Generate Geeves.Life universal transparent logo as a high-res PNG.
Uses Pillow with the installed Nunito variable font for accurate text rendering.
The logo uses white text + dark shadow technique for universal background compatibility.
"""
from PIL import Image, ImageDraw, ImageFont
import math

W, H = 1080, 1080
TEAL    = (42, 175, 169, 255)
CORAL   = (232, 98, 74, 255)
GOLD    = (212, 160, 23, 255)
PURPLE  = (139, 92, 246, 255)
BLUE    = (79, 126, 196, 255)
ORANGE  = (232, 148, 58, 255)
WHITE   = (255, 255, 255, 255)
SHADOW  = (26, 28, 32, 180)   # dark shadow, semi-transparent
GREY    = (192, 196, 204, 255)

NUNITO_PATH = "/home/ubuntu/.local/share/fonts/nunito/Nunito-Variable.ttf"

def load_font(size, weight=700):
    try:
        return ImageFont.truetype(NUNITO_PATH, size)
    except:
        return ImageFont.load_default()

def draw_circle(draw, cx, cy, r, fill=None, outline=None, width=8):
    draw.ellipse([cx-r, cy-r, cx+r, cy+r], fill=fill, outline=outline, width=width)

def draw_line(draw, x1, y1, x2, y2, fill, width=8):
    draw.line([(x1, y1), (x2, y2)], fill=fill, width=width)

def draw_arc_path(draw, cx, cy, r, fill, width=8):
    """Draw the arch: two vertical lines + semicircle top"""
    # Left vertical: from (cx-r, cy) up to (cx-r, cy-r)
    draw_line(draw, cx-r, cy, cx-r, cy-r, fill, width)
    # Right vertical: from (cx+r, cy) up to (cx+r, cy-r)
    draw_line(draw, cx+r, cy, cx+r, cy-r, fill, width)
    # Semicircle top
    draw.arc([cx-r, cy-2*r, cx+r, cy], start=180, end=0, fill=fill, width=width)
    # Inner stem from top of arch down
    draw_line(draw, cx, cy-2*r, cx, cy, fill, width)

def draw_text_with_shadow(img, text, x, y, font, text_color, shadow_color, shadow_width=14, anchor="mm"):
    """Draw text with a dark shadow underneath for universal background compatibility."""
    # Shadow layer: draw text multiple times offset in all directions
    shadow_img = Image.new("RGBA", img.size, (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow_img)
    
    # Draw shadow by offsetting in a circle
    for angle in range(0, 360, 15):
        rad = math.radians(angle)
        ox = int(math.cos(rad) * shadow_width * 0.6)
        oy = int(math.sin(rad) * shadow_width * 0.6)
        shadow_draw.text((x + ox, y + oy), text, font=font, fill=shadow_color, anchor=anchor)
    
    # Also draw a few pixels in cardinal directions for stronger shadow
    for d in range(1, shadow_width + 1, 2):
        for ox, oy in [(d, 0), (-d, 0), (0, d), (0, -d), (d, d), (-d, -d), (d, -d), (-d, d)]:
            shadow_draw.text((x + ox, y + oy), text, font=font, fill=shadow_color, anchor=anchor)
    
    img.alpha_composite(shadow_img)
    
    # Draw actual text
    draw = ImageDraw.Draw(img)
    draw.text((x, y), text, font=font, fill=text_color, anchor=anchor)

# ── Create transparent canvas ──
img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

# ── Constellation mark ──
# Coordinates
apex  = (540, 175)
left  = (350, 310)
right = (730, 310)
bl    = (350, 530)
br    = (730, 530)
mid   = (540, 390)
bot   = (540, 640)
base_y = 530

# Roof lines
draw_line(draw, *apex, *left, TEAL)
draw_line(draw, *apex, *right, TEAL)

# Verticals
draw_line(draw, *left, *bl, CORAL)
draw_line(draw, *right, *br, GOLD)

# Base horizontals
draw_line(draw, bl[0], bl[1], 470, base_y, PURPLE)
draw_line(draw, 610, base_y, br[0], br[1], BLUE)

# Arch (arch centre at x=540, top at y=390, bottom at y=530, radius=70)
arch_cx, arch_top, arch_bot, arch_r = 540, 390, 530, 70
draw_line(draw, arch_cx - arch_r, arch_bot, arch_cx - arch_r, arch_top + arch_r, TEAL)
draw_line(draw, arch_cx + arch_r, arch_bot, arch_cx + arch_r, arch_top + arch_r, TEAL)
draw.arc([arch_cx - arch_r, arch_top - arch_r, arch_cx + arch_r, arch_top + arch_r],
         start=180, end=0, fill=TEAL, width=8)

# Inner stem
draw_line(draw, 540, 390, 540, 530, TEAL)
draw_line(draw, 540, 530, 540, 640, ORANGE)

# Nodes
draw_circle(draw, *apex, 36, fill=TEAL)
draw_circle(draw, *left, 30, fill=CORAL)
draw_circle(draw, *right, 30, fill=GOLD)
draw_circle(draw, *mid, 22, fill=TEAL)
draw_circle(draw, *bl, 30, fill=PURPLE)
draw_circle(draw, *br, 30, fill=BLUE)
# Open/hollow bottom node
draw_circle(draw, *bot, 26, fill=(0, 0, 0, 0), outline=ORANGE, width=8)

# ── Wordmark ──
wm_font = load_font(118, weight=700)
tag_font = load_font(30, weight=300)

shadow_color = (26, 28, 32, 165)

# Measure "Geeves." and "Life" to centre them together
bbox_g = wm_font.getbbox("Geeves.")
bbox_l = wm_font.getbbox("Life")
w_g = bbox_g[2] - bbox_g[0]
w_l = bbox_l[2] - bbox_l[0]
total_w = w_g + w_l
start_x = W // 2 - total_w // 2
geeves_x = start_x - bbox_g[0]
life_x = start_x + w_g - bbox_l[0]
wm_y = 856

# Draw "Geeves." with strong shadow (white text)
draw_text_with_shadow(img, "Geeves.", geeves_x, wm_y, wm_font,
                      text_color=WHITE, shadow_color=shadow_color,
                      shadow_width=14, anchor="lt")

# Draw "Life" with lighter shadow (teal text — already saturated)
draw_text_with_shadow(img, "Life", life_x, wm_y, wm_font,
                      text_color=TEAL, shadow_color=(26, 28, 32, 100),
                      shadow_width=6, anchor="lt")

# Tagline
draw_text_with_shadow(img, "OPERATING SYSTEM", W // 2, 910, tag_font,
                      text_color=GREY, shadow_color=(26, 28, 32, 120),
                      shadow_width=6, anchor="mt")

# ── Save ──
out_path = "/home/ubuntu/geeves-shopping/geeves_universal_transparent.png"
img.save(out_path, "PNG")
print(f"Saved: {out_path}  ({W}x{H})")

# ── Also save a preview on dark + light backgrounds ──
preview_w = W * 3 + 80
preview = Image.new("RGBA", (preview_w, H), (0, 0, 0, 0))

dark_bg   = Image.new("RGBA", (W, H), (26, 28, 32, 255))
dark_bg.alpha_composite(img)
preview.paste(dark_bg, (0, 0))

mid_bg    = Image.new("RGBA", (W, H), (30, 60, 100, 255))
mid_bg.alpha_composite(img)
preview.paste(mid_bg, (W + 40, 0))

light_bg  = Image.new("RGBA", (W, H), (245, 245, 242, 255))
light_bg.alpha_composite(img)
preview.paste(light_bg, (W * 2 + 80, 0))

preview_path = "/home/ubuntu/geeves_universal_preview_v2.png"
preview.convert("RGB").save(preview_path, "PNG")
print(f"Saved preview: {preview_path}")
