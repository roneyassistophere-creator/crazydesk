"""
CrazyDesk Tracker — Generate app icon (.ico for Windows)
=========================================================
Run this once to create the icon file used by the .exe build.
"""

from PIL import Image, ImageDraw, ImageFont
import os

SIZES = [16, 24, 32, 48, 64, 128, 256]


def create_icon_frame(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Background rounded-ish square
    pad = max(1, size // 16)
    r = max(2, size // 6)
    draw.rounded_rectangle(
        [pad, pad, size - pad, size - pad],
        radius=r,
        fill=(30, 35, 42, 255),
    )

    # "CD" text or just a colored dot for small sizes
    if size >= 48:
        try:
            font = ImageFont.truetype("arial.ttf", size=size // 3)
        except Exception:
            font = ImageFont.load_default()
        bbox = draw.textbbox((0, 0), "CD", font=font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        tx = (size - tw) // 2
        ty = (size - th) // 2 - bbox[1]
        draw.text((tx, ty), "CD", fill=(100, 25, 230, 255), font=font)
    else:
        # Small: just a purple dot
        cx, cy = size // 2, size // 2
        ds = max(3, size // 4)
        draw.ellipse(
            [cx - ds, cy - ds, cx + ds, cy + ds],
            fill=(100, 25, 230, 255),
        )

    return img


def main():
    out_dir = os.path.dirname(os.path.abspath(__file__))
    ico_path = os.path.join(out_dir, "assets", "icon.ico")
    png_path = os.path.join(out_dir, "assets", "icon.png")
    os.makedirs(os.path.join(out_dir, "assets"), exist_ok=True)

    frames = [create_icon_frame(s) for s in SIZES]

    # Save .ico (multi-size)
    frames[0].save(ico_path, format="ICO", sizes=[(s, s) for s in SIZES], append_images=frames[1:])
    print(f"Created {ico_path}")

    # Save 256px PNG
    frames[-1].save(png_path, format="PNG")
    print(f"Created {png_path}")


if __name__ == "__main__":
    main()
