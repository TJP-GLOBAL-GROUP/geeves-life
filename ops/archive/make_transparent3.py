"""Generate transparent background PNG by removing the near-white background from the light mode constructed PNG."""
from PIL import Image
import numpy as np

# Load the light mode PNG (has off-white background #F5F5F3 or similar)
img = Image.open('/tmp/brand_kit/geeves_light_constructed.png').convert('RGBA')
data = np.array(img)

# The background is very light (near white). Find pixels that are very close to the background color.
# Sample the top-left corner to get the exact background color
bg_color = data[0, 0, :3]
print(f"Background color (top-left): RGB({bg_color[0]}, {bg_color[1]}, {bg_color[2]})")

# Create a mask for pixels that are very close to the background color (within threshold)
threshold = 15
diff = np.abs(data[:, :, :3].astype(int) - bg_color.astype(int))
mask = np.all(diff < threshold, axis=2)

# Set those pixels to transparent
data[mask, 3] = 0

# Save
result = Image.fromarray(data)
result.save('/tmp/brand_kit/geeves_transparent_bg.png', 'PNG')
print(f"Saved transparent background version: {result.size}, mode={result.mode}")

# Verify
px = result.getpixel((0, 0))
print(f"Top-left pixel: {px} (should have alpha=0)")
px_center = result.getpixel((540, 300))
print(f"Center-top pixel (should be logo element): {px_center}")
