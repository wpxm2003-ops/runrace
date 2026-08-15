from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = ROOT / "docs" / "playstore-screenshots-2026"
SOURCE_DIR = ASSET_DIR / "sources"
BACKGROUND = ASSET_DIR / "background.png"
FONT_BOLD = Path(r"C:\Windows\Fonts\malgunbd.ttf")
FONT_REGULAR = Path(r"C:\Windows\Fonts\malgun.ttf")

WIDTH, HEIGHT = 1080, 1920
ORANGE = (255, 90, 31)
BLACK = (15, 15, 15)
GRAY = (100, 100, 100)

ITEMS = [
    (1, "오늘의 러닝을", "한눈에 시작하세요", "01-home.png"),
    (8, "친구와 달리면", "레이스가 더 뜨거워진다", "02-race.png"),
    (6, "내 기록으로 완성하는", "맞춤형 NSM 훈련", "03-nsm-coach.png"),
    (3, "매 순간의 기록을", "더 자세하게", "04-workout-detail.png"),
    (2, "러닝머신 기록도", "사진 한 장으로 간편하게", "05-indoor-run.png"),
    (5, "쌓일수록 선명해지는", "나의 러닝 성장", "06-monthly-stats.png"),
    (4, "함께 달리면", "더 멀리 갈 수 있으니까", "07-crew.png"),
    (7, "달린 모든 순간을", "하나의 기록으로", "08-record-summary.png"),
]


def rounded_mask(size: tuple[int, int], radius: int) -> Image.Image:
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size[0], size[1]), radius=radius, fill=255)
    return mask


def paste_centered_text(
    canvas: Image.Image,
    line_one: str,
    line_two: str,
) -> None:
    draw = ImageDraw.Draw(canvas)
    eyebrow_font = ImageFont.truetype(str(FONT_BOLD), 30)
    subtitle_font = ImageFont.truetype(str(FONT_REGULAR), 27)

    def fitted_font(text: str, preferred_size: int = 66, max_width: int = 920) -> ImageFont.FreeTypeFont:
        size = preferred_size
        while size > 42:
            font = ImageFont.truetype(str(FONT_BOLD), size)
            if draw.textbbox((0, 0), text, font=font)[2] <= max_width:
                return font
            size -= 2
        return ImageFont.truetype(str(FONT_BOLD), size)

    draw.rounded_rectangle((440, 54, 640, 101), radius=24, fill=BLACK)
    draw.text((540, 77), "RUNRACE", font=eyebrow_font, fill="white", anchor="mm")

    draw.text((540, 172), line_one, font=fitted_font(line_one), fill=ORANGE, anchor="mm")
    draw.text((540, 250), line_two, font=fitted_font(line_two), fill=BLACK, anchor="mm")
    draw.text(
        (540, 322),
        "달릴수록 쌓이는 기록, 경쟁할수록 커지는 동기",
        font=subtitle_font,
        fill=GRAY,
        anchor="mm",
    )


def build(source_number: int, line_one: str, line_two: str, output_name: str) -> None:
    background = Image.open(BACKGROUND).convert("RGB")
    canvas = background.resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)
    paste_centered_text(canvas, line_one, line_two)

    source = Image.open(SOURCE_DIR / f"{source_number:02d}.png").convert("RGB")
    phone_width = 820
    scale = phone_width / source.width
    phone_height = int(source.height * scale)
    source = source.resize((phone_width, phone_height), Image.Resampling.LANCZOS)

    frame_x = (WIDTH - phone_width) // 2
    frame_y = 405
    border = 12
    radius = 62

    shadow = Image.new("RGBA", (phone_width + 90, phone_height + 90), (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.rounded_rectangle(
        (45, 35, phone_width + 45, phone_height + 35),
        radius=radius + border,
        fill=(0, 0, 0, 95),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(26))
    canvas.paste(shadow, (frame_x - 45, frame_y - 25), shadow)

    frame = Image.new("RGBA", (phone_width + border * 2, phone_height + border * 2), (0, 0, 0, 0))
    ImageDraw.Draw(frame).rounded_rectangle(
        (0, 0, frame.width - 1, frame.height - 1),
        radius=radius + border,
        fill=BLACK,
    )
    source_rgba = source.convert("RGBA")
    source_rgba.putalpha(rounded_mask(source.size, radius))
    frame.alpha_composite(source_rgba, (border, border))
    canvas.paste(frame, (frame_x - border, frame_y - border), frame)

    canvas.save(ASSET_DIR / output_name, format="PNG", optimize=True)


if __name__ == "__main__":
    for item in ITEMS:
        build(*item)
        print(f"saved {item[-1]}")
