from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(r"C:\workspace\runrace")
SRC_DIR = ROOT / ".codex-remote-attachments" / "019f1b86-b69f-79b0-9c7e-b42566fb73b1" / "91a674e7-2ae7-4c79-91da-2d3461775792"
OUT_DIR = ROOT / "docs" / "playstore-screenshots-real"
OUT_DIR.mkdir(parents=True, exist_ok=True)

FONT_BOLD = r"C:\Windows\Fonts\malgunbd.ttf"
FONT_REG = r"C:\Windows\Fonts\malgun.ttf"

ITEMS = [
    (
        "1-Photo-1.jpg",
        "\uacfc\ud559\uc801 \ud6c8\ub828",
        "\ucd5c\uadfc \uae30\ub85d\uc73c\ub85c \ud398\uc774\uc2a4\uc640\n\uc8fc\uac04 \uc2a4\ucf00\uc904\uc744 \uacc4\uc0b0",
        "01-nsm-coach.png",
    ),
    (
        "2-Photo-2.jpg",
        "\uce5c\uad6c\uc640 \ub808\uc774\uc2a4",
        "\uc21c\uc704\uc640 \uae30\ub85d\uc73c\ub85c\n\ud568\uaed8 \ub2ec\ub9ac\ub294 \uc7ac\ubbf8",
        "02-race-with-friends.png",
    ),
    (
        "3-Photo-3.jpg",
        "\uc2e4\uc2dc\uac04 \ub7ec\ub2dd \uae30\ub85d",
        "GPS \uacbd\ub85c\uc640 \uac70\ub9ac, \ud398\uc774\uc2a4\ub97c\n\ub2ec\ub9ac\uba74\uc11c \ubc14\ub85c \ud655\uc778",
        "03-live-workout.png",
    ),
    (
        "4-Photo-4.jpg",
        "\uc6b4\ub3d9 \uae30\ub85d\uc774 \uc313\uc778\ub2e4",
        "\ud55c \ubc88\uc758 \ub7ec\ub2dd\ub3c4 \ube60\uc9d0\uc5c6\uc774\n\ub9e4\uc77c \ub204\uc801",
        "04-workout-records.png",
    ),
    (
        "5-Photo-5.jpg",
        "\uc6d4\ubcc4 \ud1b5\uacc4 \ud655\uc778",
        "\ud328\ud134, \uc5f0\uc18d \uc6b4\ub3d9, \ucd5c\uace0 \uae30\ub85d\uae4c\uc9c0\n\ud55c\ub208\uc5d0 \uc815\ub9ac",
        "05-monthly-stats.png",
    ),
]

W, H = 1242, 2208
BG = (248, 248, 246)
INK = (20, 20, 20)
SUB = (70, 70, 78)
MAGENTA = (209, 35, 120)
NAVY = (32, 42, 92)


def build_mockup(src_name: str, title: str, subtitle: str, out_name: str) -> None:
    base = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(base)

    draw.polygon([(0, 0), (190, 0), (0, 330)], fill=(245, 245, 245))
    for i, color in enumerate([MAGENTA, (166, 30, 107), NAVY]):
        x = 40 + i * 46
        draw.rounded_rectangle((x, 0, x + 18, 280 - i * 28), radius=10, fill=color)
    for i, color in enumerate([NAVY, (166, 30, 107), MAGENTA]):
        x = W - 210 + i * 46
        draw.rounded_rectangle((x, H - 330 + i * 26, x + 18, H), radius=10, fill=color)

    logo_font = ImageFont.truetype(FONT_BOLD, 72)
    title_font = ImageFont.truetype(FONT_BOLD, 98)
    sub_font = ImageFont.truetype(FONT_REG, 44)

    draw.text((W // 2, 110), "RunRace", font=logo_font, fill=NAVY, anchor="ma")
    draw.text((W // 2, 250), title, font=title_font, fill=INK, anchor="ma")
    draw.multiline_text((W // 2, 410), subtitle, font=sub_font, fill=SUB, anchor="ma", align="center", spacing=10)

    shot = Image.open(SRC_DIR / src_name).convert("RGB")
    scale = min(900 / shot.width, 1450 / shot.height)
    shot = shot.resize((int(shot.width * scale), int(shot.height * scale)), Image.LANCZOS)

    radius = 42
    pad = 18
    card_w = shot.width + pad * 2
    card_h = shot.height + pad * 2
    card_x = (W - card_w) // 2
    card_y = 600

    shadow = Image.new("RGBA", (card_w + 40, card_h + 40), (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(shadow)
    sdraw.rounded_rectangle((20, 20, card_w + 20, card_h + 20), radius=radius + 12, fill=(0, 0, 0, 70))
    shadow = shadow.filter(ImageFilter.GaussianBlur(18))
    base.paste(shadow, (card_x - 20, card_y - 10), shadow)

    card = Image.new("RGBA", (card_w, card_h), (255, 255, 255, 0))
    cdraw = ImageDraw.Draw(card)
    cdraw.rounded_rectangle((0, 0, card_w, card_h), radius=radius, fill=(255, 255, 255, 255))

    mask = Image.new("L", shot.size, 0)
    mdraw = ImageDraw.Draw(mask)
    mdraw.rounded_rectangle((0, 0, shot.width, shot.height), radius=28, fill=255)
    rounded_shot = Image.new("RGBA", shot.size, (255, 255, 255, 0))
    rounded_shot.paste(shot, (0, 0))
    rounded_shot.putalpha(mask)

    card.paste(rounded_shot, (pad, pad), rounded_shot)
    base.paste(card, (card_x, card_y), card)
    base.save(OUT_DIR / out_name, quality=95)


for item in ITEMS:
    build_mockup(*item)
    print(f"saved {item[-1]}")
