"""
Generate multi-resolution app icons (.ico, .png) from Paul's Pixel Duck sprite.
Used by Electron BrowserWindow taskbar, desktop shortcuts, and electron-builder packaging.
"""

import os
from PIL import Image, ImageDraw

ROWS = [
    '........................',
    '........................',
    '.........KKKKKK.........',
    '.......KKWWWWWWKK.......',
    '......KWWWWWWWWWWK......',
    '.....KWWWWWWWWWWWWK.....',
    '.....KWWWWWWWWWWWWK.....',
    '....KWWWEWWWWWWEWWWK....',
    '....KWWWEWWWWWWEWWWK....',
    '....KWWWWOOOOOOWWWWK....',
    '...KWWPWOOOOOOOOWPWWK...',
    '...KWWWWWDDDDDDWWWWWK...',
    '...KWWWWWWWWWWWWWWWWK...',
    '..KWWWWWWWWWWWWWWWWWWK..',
    '..KWKWWWWWWWWWWWWWWKWK..',
    '..KWKWWWWWWWWWWWWWWKWK..',
    '..KWWKWWWWWWWWWWWWKWWK..',
    '..KSWWWWWWWWWWWWWWWWSK..',
    '...KSSWWWWWWWWWWWWSSK...',
    '....KKSSSSSSSSSSSSKK....',
    '......KKKKKKKKKKKK......',
    '......KOOOK..KOOOK......',
    '......KKKKK..KKKKK......',
    '........................',
]

PALETTE = {
    'K': (28, 25, 23, 255),      # #1c1917 outline
    'W': (255, 255, 255, 255),  # #ffffff feathers
    'S': (213, 221, 232, 255),  # #d5dde8 feather shade
    'O': (245, 158, 11, 255),   # #f59e0b beak & feet
    'D': (194, 65, 12, 255),    # #c2410c beak underside
    'E': (17, 17, 17, 255),      # #111111 eyes
    'P': (253, 164, 175, 255),  # #fda4af blush
    '.': (0, 0, 0, 0),          # transparent
}

def generate_icons():
    # 1. Create native 24x24 pixel image
    img24 = Image.new('RGBA', (24, 24), (0, 0, 0, 0))
    for y, row in enumerate(ROWS):
        for x, char in enumerate(row):
            img24.putpixel((x, y), PALETTE.get(char, (0, 0, 0, 0)))

    # 2. Render on 512x512 app squircle tile
    size = 512
    app_icon = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(app_icon)

    # Modern squircle background: dark slate #0f172a with emerald glow border
    margin = 24
    radius = 96
    draw.rounded_rectangle(
        [margin, margin, size - margin, size - margin],
        radius=radius,
        fill=(15, 23, 42, 255),
        outline=(52, 211, 153, 200), # emerald border #34d399
        width=6
    )

    # Scale pixel duck nearest-neighbor to fill ~384x384 centered
    duck_size = 384
    duck_scaled = img24.resize((duck_size, duck_size), Image.Resampling.NEAREST)
    offset = (size - duck_size) // 2
    app_icon.alpha_composite(duck_scaled, (offset, offset + 4))

    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    build_dir = os.path.join(base_dir, 'build')
    public_dir = os.path.join(base_dir, 'public')

    os.makedirs(build_dir, exist_ok=True)
    os.makedirs(public_dir, exist_ok=True)

    app_icon.save(os.path.join(build_dir, 'icon.png'), 'PNG')
    app_icon.save(os.path.join(public_dir, 'icon.png'), 'PNG')

    # Save multi-size ICO file for Windows taskbar & desktop shortcuts
    ico_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    app_icon.save(os.path.join(build_dir, 'icon.ico'), format='ICO', sizes=ico_sizes)
    app_icon.save(os.path.join(public_dir, 'favicon.ico'), format='ICO', sizes=ico_sizes)
    print("Successfully generated build/icon.ico and build/icon.png")

if __name__ == '__main__':
    generate_icons()
