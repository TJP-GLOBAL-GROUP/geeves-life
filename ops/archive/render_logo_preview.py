"""
Render the universal transparent logo on dark and light backgrounds
side by side so we can verify the dual-halo effect works on both.
"""
import cairosvg
from PIL import Image
import io

SVG_PATH = "/home/ubuntu/geeves-shopping/geeves_universal_transparent.svg"

# Render the SVG to PNG bytes (transparent background)
png_bytes = cairosvg.svg2png(url=SVG_PATH, output_width=540, output_height=540)
logo = Image.open(io.BytesIO(png_bytes)).convert("RGBA")

# Create side-by-side preview: dark left, light right, coloured middle
W, H = 540, 540
PADDING = 20
canvas_w = W * 3 + PADDING * 4
canvas_h = H + PADDING * 2

canvas = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))

# Dark background panel
dark_bg = Image.new("RGBA", (W, H), (26, 28, 32, 255))  # Geeves charcoal
dark_bg.paste(logo, (0, 0), logo)
canvas.paste(dark_bg, (PADDING, PADDING))

# Coloured background panel (mid-blue to test on colour)
colour_bg = Image.new("RGBA", (W, H), (30, 60, 100, 255))
colour_bg.paste(logo, (0, 0), logo)
canvas.paste(colour_bg, (PADDING * 2 + W, PADDING))

# Light background panel
light_bg = Image.new("RGBA", (W, H), (245, 245, 242, 255))  # near-white
light_bg.paste(logo, (0, 0), logo)
canvas.paste(light_bg, (PADDING * 3 + W * 2, PADDING))

out_path = "/home/ubuntu/geeves_universal_preview.png"
canvas.convert("RGB").save(out_path, "PNG")
print(f"Saved preview to {out_path}")
