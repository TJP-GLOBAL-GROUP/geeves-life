"""Generate transparent background PNG from the dark mode SVG (which has the logo elements on a transparent canvas)."""
import cairosvg
from PIL import Image
import io

# Render the dark mode SVG at 1080x1080 - SVG naturally has transparent background
# We'll use the dark mode SVG since it has light/white text that works on transparent
svg_dark = open('/tmp/brand_kit/geeves_dark_mode.svg', 'rb').read()
png_data = cairosvg.svg2png(bytestring=svg_dark, output_width=1080, output_height=1080)
img = Image.open(io.BytesIO(png_data))
print(f"SVG rendered: {img.size}, mode={img.mode}")

# The SVG renders with transparent background by default (RGBA)
# Save as transparent PNG
img.save('/tmp/brand_kit/geeves_transparent_bg.png', 'PNG')
print("Saved transparent background version")

# Also create a version using the light mode SVG elements on transparent bg
svg_light = open('/tmp/brand_kit/geeves_light_mode.svg', 'rb').read()
png_data_light = cairosvg.svg2png(bytestring=svg_light, output_width=1080, output_height=1080)
img_light = Image.open(io.BytesIO(png_data_light))
img_light.save('/tmp/brand_kit/geeves_transparent_light_text.png', 'PNG')
print("Saved transparent background (light text variant) version")
