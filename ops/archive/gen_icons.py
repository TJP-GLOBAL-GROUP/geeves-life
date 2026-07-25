"""Generate favicon and extension icons from the Geeves brand SVG.
Crops to just the constellation/house icon mark (no text).
"""
from PIL import Image
import subprocess
import os

# First, create an icon-only SVG (just the mark, no wordmark/tagline)
icon_svg = '''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="280 120 520 580" width="520" height="580">
  <!-- Background -->
  <rect x="280" y="120" width="520" height="580" fill="#1A1C20"/>

  <!-- ROOF LINES -->
  <line x1="540" y1="175" x2="350" y2="310"
        stroke="#2AAFA9" stroke-width="8" stroke-linecap="round"/>
  <line x1="540" y1="175" x2="730" y2="310"
        stroke="#2AAFA9" stroke-width="8" stroke-linecap="round"/>

  <!-- VERTICALS -->
  <line x1="350" y1="310" x2="350" y2="530"
        stroke="#E8624A" stroke-width="8" stroke-linecap="round"/>
  <line x1="730" y1="310" x2="730" y2="530"
        stroke="#D4A017" stroke-width="8" stroke-linecap="round"/>

  <!-- BASE HORIZONTALS -->
  <line x1="350" y1="530" x2="470" y2="530"
        stroke="#8B5CF6" stroke-width="8" stroke-linecap="round"/>
  <line x1="610" y1="530" x2="730" y2="530"
        stroke="#4F7EC4" stroke-width="8" stroke-linecap="round"/>

  <!-- ARCH -->
  <path d="M 470.0,530.0 L 470.0,460.0 C 470.0,421.339 501.339,390.0 540.0,390.0 C 578.661,390.0 610.0,421.339 610.0,460.0 L 610.0,530.0"
        fill="none" stroke="#2AAFA9" stroke-width="8"
        stroke-linecap="round" stroke-linejoin="round"/>

  <!-- INNER STEM -->
  <line x1="540" y1="390" x2="540" y2="530"
        stroke="#2AAFA9" stroke-width="8" stroke-linecap="round"/>
  <line x1="540" y1="530" x2="540" y2="640"
        stroke="#E8943A" stroke-width="8" stroke-linecap="round"/>

  <!-- NODES -->
  <circle cx="540" cy="175" r="36" fill="#2AAFA9"/>
  <circle cx="350" cy="310" r="30" fill="#E8624A"/>
  <circle cx="730" cy="310" r="30" fill="#D4A017"/>
  <circle cx="540" cy="390" r="22" fill="#2AAFA9"/>
  <circle cx="350" cy="530" r="30" fill="#8B5CF6"/>
  <circle cx="730" cy="530" r="30" fill="#4F7EC4"/>
  <!-- Open/hollow bottom node -->
  <circle cx="540" cy="640" r="26"
          fill="#1A1C20" stroke="#E8943A" stroke-width="8"/>
</svg>'''

# Save icon-only SVG
with open('/tmp/icon_mark.svg', 'w') as f:
    f.write(icon_svg)

# Use cairosvg to render to PNG at various sizes
try:
    import cairosvg
    
    # Generate high-res base (512x512)
    cairosvg.svg2png(bytestring=icon_svg.encode(), write_to='/tmp/icon_512.png', output_width=512, output_height=512)
    
    # Now use PIL to create all needed sizes
    base = Image.open('/tmp/icon_512.png')
    
    # Make it square with padding
    # The viewBox is 520x580, so we need to pad to square
    size = max(base.size)
    square = Image.new('RGBA', (size, size), (26, 28, 32, 255))  # #1A1C20 background
    offset = ((size - base.width) // 2, (size - base.height) // 2)
    square.paste(base, offset, base)
    
    # Favicon sizes
    favicon_16 = square.resize((16, 16), Image.LANCZOS)
    favicon_32 = square.resize((32, 32), Image.LANCZOS)
    favicon_48 = square.resize((48, 48), Image.LANCZOS)
    favicon_64 = square.resize((64, 64), Image.LANCZOS)
    favicon_128 = square.resize((128, 128), Image.LANCZOS)
    favicon_192 = square.resize((192, 192), Image.LANCZOS)
    favicon_256 = square.resize((256, 256), Image.LANCZOS)
    favicon_512 = square.resize((512, 512), Image.LANCZOS)
    
    # Save favicon.ico (multi-size)
    favicon_256.save('/tmp/favicon.ico', format='ICO', sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    
    # Save PNG versions for web manifest
    favicon_192.save('/tmp/icon-192.png')
    favicon_512.save('/tmp/icon-512.png')
    favicon_32.save('/tmp/favicon-32.png')
    
    # Chrome extension icons (16, 48, 128)
    ext_16 = square.resize((16, 16), Image.LANCZOS)
    ext_48 = square.resize((48, 48), Image.LANCZOS)
    ext_128 = square.resize((128, 128), Image.LANCZOS)
    
    ext_16.save('/tmp/ext-icon-16.png')
    ext_48.save('/tmp/ext-icon-48.png')
    ext_128.save('/tmp/ext-icon-128.png')
    
    print("All icons generated successfully!")
    print(f"  favicon.ico: multi-size ICO")
    print(f"  icon-192.png: 192x192")
    print(f"  icon-512.png: 512x512")
    print(f"  ext-icon-16.png: 16x16")
    print(f"  ext-icon-48.png: 48x48")
    print(f"  ext-icon-128.png: 128x128")
    
except ImportError:
    print("cairosvg not available, trying alternative...")
    # Fallback: use the existing PNG and crop it
    img = Image.open('/tmp/brand_kit/geeves_dark_constructed.png')
    # Crop to just the icon mark (top portion, no text)
    # The icon is roughly in the top 65% of the image
    w, h = img.size
    # Crop: left=230, top=100, right=850, bottom=720 (approximate icon bounds in 1080x1080)
    icon_crop = img.crop((230, 100, 850, 720))
    
    # Make square
    size = max(icon_crop.size)
    square = Image.new('RGBA', (size, size), (26, 28, 32, 255))
    offset = ((size - icon_crop.width) // 2, (size - icon_crop.height) // 2)
    square.paste(icon_crop, offset)
    
    # Generate all sizes
    square.resize((256, 256), Image.LANCZOS).save('/tmp/favicon.ico', format='ICO', sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    square.resize((192, 192), Image.LANCZOS).save('/tmp/icon-192.png')
    square.resize((512, 512), Image.LANCZOS).save('/tmp/icon-512.png')
    square.resize((32, 32), Image.LANCZOS).save('/tmp/favicon-32.png')
    square.resize((16, 16), Image.LANCZOS).save('/tmp/ext-icon-16.png')
    square.resize((48, 48), Image.LANCZOS).save('/tmp/ext-icon-48.png')
    square.resize((128, 128), Image.LANCZOS).save('/tmp/ext-icon-128.png')
    
    print("All icons generated (from PNG crop)!")
