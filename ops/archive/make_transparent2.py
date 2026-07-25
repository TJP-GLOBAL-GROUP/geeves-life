"""Generate transparent background PNG by removing the background rect from the SVG."""
import cairosvg
from PIL import Image
import io
import re

# Read the dark mode SVG and remove the background rect
svg_dark = open('/tmp/brand_kit/geeves_dark_mode.svg', 'r').read()
svg_transparent = re.sub(r'<!-- Background -->\s*<rect[^/]*/>', '', svg_dark)
# Verify removal
print("Background rect removed:", "Background" not in svg_transparent)

# Render with transparent background
png_data = cairosvg.svg2png(bytestring=svg_transparent.encode(), output_width=1080, output_height=1080)
img = Image.open(io.BytesIO(png_data))
print(f"Rendered: {img.size}, mode={img.mode}")
# Convert to RGBA if needed
if img.mode != 'RGBA':
    img = img.convert('RGBA')
px = img.getpixel((0, 0))
print(f"Top-left pixel (should be transparent): {px}")
img.save('/tmp/brand_kit/geeves_transparent_bg.png', 'PNG')
print("Saved: geeves_transparent_bg.png")

# Also do the light mode SVG
svg_light = open('/tmp/brand_kit/geeves_light_mode.svg', 'r').read()
svg_light_transparent = re.sub(r'<!-- Background -->\s*<rect[^/]*/>', '', svg_light)
png_data_light = cairosvg.svg2png(bytestring=svg_light_transparent.encode(), output_width=1080, output_height=1080)
img_light = Image.open(io.BytesIO(png_data_light))
if img_light.mode != 'RGBA':
    img_light = img_light.convert('RGBA')
px_light = img_light.getpixel((0, 0))
print(f"Light transparent top-left pixel: {px_light}")
img_light.save('/tmp/brand_kit/geeves_transparent_light_elements.png', 'PNG')
print("Saved: geeves_transparent_light_elements.png")
