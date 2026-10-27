"""자세 그림 합성과 WebP 내보내기.

Codex 로 고친 자세 그림(art/src/<장면>-<자세>.png)에서 사람 영역만 떼어 기준 그림(말하는 자세)에 붙인다.
사람 밖의 픽셀은 네 장 모두 기준 그림과 같아서, 자세를 바꿔도 스피커·시계·조명이 흔들리지 않는다.
결과는 site/media/stage/ 에 WebP(품질 88, 종이 질감이 뭉개지지 않는 값)로 쓴다.

실행: python3 video/art/compose.py   (저장소 루트에서)
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "video/art/src"
DST = ROOT / "site/media/stage"
W, H = 1536, 1024

# 장면마다: 기준 그림, 사람 영역(두 그림 차이를 64px 띠로 재서 정함), 경계 흐림
SCENES = {
    "bedroom": {"base": "bedroom-facepalm", "box": (96, 280, 800, H), "blur": 32},
    "living": {"base": "living-talk", "box": (40, 230, 780, 800), "blur": 36},
}


def main() -> None:
    DST.mkdir(parents=True, exist_ok=True)
    for scene, cfg in SCENES.items():
        base = Image.open(SRC / f"{cfg['base']}.png").convert("RGB")
        mask = Image.new("L", (W, H), 0)
        ImageDraw.Draw(mask).rectangle(cfg["box"], fill=255)
        mask = mask.filter(ImageFilter.GaussianBlur(cfg["blur"]))
        base.save(DST / f"{scene}-say.webp", "WEBP", quality=88, method=6)
        for pose in ("neutral", "wait", "relief"):
            pic = Image.open(SRC / f"{scene}-{pose}.png").convert("RGB")
            Image.composite(pic, base, mask).save(DST / f"{scene}-{pose}.webp", "WEBP", quality=88, method=6)
    # 타임라인용 작은 그림: 침실 그림에서 얼굴(말하는 자세·기다리는 자세)과 스피커를 잘라 둥글게 쓴다
    crops = {"icon-person": ("bedroom-facepalm", (300, 330, 560, 590)), "icon-wait": ("bedroom-wait-c", (290, 330, 550, 590)), "icon-speaker": ("bedroom-facepalm", (1100, 560, 1360, 820))}
    for out, (name, box) in crops.items():
        Image.open(SRC / f"{name}.png").convert("RGB").crop(box).resize((192, 192), Image.LANCZOS).save(DST / f"{out}.webp", "WEBP", quality=88, method=6)
    for kind in ("analyst", "upper", "gate"):
        Image.open(SRC / f"helper-{kind}.png").convert("RGB").resize((512, 512), Image.LANCZOS).save(DST / f"helper-{kind}.webp", "WEBP", quality=88, method=6)


if __name__ == "__main__":
    main()
