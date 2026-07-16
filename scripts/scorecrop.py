# scorecrop.py —— 谱图裁剪工作流工具（闭环转录用）
# 解决问题：人工心算多级缩放坐标必然裁偏。原则：坐标只从网格图上读，裁片必先画框自检。
#
# 用法：
#   python3 scorecrop.py grid  <img> [out.png]              # 输出带 100px 网格+坐标标尺的图（缩放至≤1600宽）
#   python3 scorecrop.py cols  <img> <y0> <y1> [outdir]     # 墨迹投影自动切该横带的字列，出 编号tile + 画框总览
#   python3 scorecrop.py tiles <img> <spec.json> [outdir]   # 按 {"name":[x0,y0,x1,y1],...} 裁片，先出画框总览 _overview.png
#
# 工作流（强制）：grid 读坐标 → tiles/cols 生成 → 先 Read *_overview.png 确认所有框住目标 → 再用裁片。
import sys, os, json
from PIL import Image, ImageDraw, ImageFont

RED = (200, 40, 30)

def load(p):
    return Image.open(p).convert("RGB")

def grid(img_path, out=None):
    im = load(img_path)
    d = ImageDraw.Draw(im)
    step = 100
    for x in range(0, im.width, step):
        major = (x % 500 == 0)
        d.line([(x, 0), (x, im.height)], fill=(255, 120, 0) if major else (255, 190, 120), width=3 if major else 1)
        if major:
            for y in range(60, im.height, 700):
                d.text((x + 4, y), str(x), fill=RED)
    for y in range(0, im.height, step):
        major = (y % 500 == 0)
        d.line([(0, y), (im.width, y)], fill=(255, 120, 0) if major else (255, 190, 120), width=3 if major else 1)
        if major:
            for x in range(10, im.width, 600):
                d.text((x, y + 4), str(y), fill=RED)
    if im.width > 1600:
        im = im.resize((1600, int(im.height * 1600 / im.width)), Image.LANCZOS)
    out = out or os.path.splitext(img_path)[0] + "_grid.png"
    im.save(out)
    print("grid ->", out, im.size)

def cols(img_path, y0, y1, outdir="."):
    """竖直墨迹投影自动分列：适合减字带（列间有空白）。"""
    im = load(img_path)
    band = im.crop((0, y0, im.width, y1)).convert("L")
    px = band.load()
    W, H = band.size
    ink = [sum(1 for y in range(H) if px[x, y] < 140) for x in range(W)]
    thr = max(2, int(H * 0.02))
    runs, s = [], None
    for x in range(W):
        if ink[x] > thr and s is None:
            s = x
        elif ink[x] <= thr and s is not None:
            if x - s > 14: runs.append((s, x))
            s = None
    if s is not None: runs.append((s, W))
    # 间隔 < 28px 的相邻墨块并为同一字列（部件间缝）
    merged = []
    for r in runs:
        if merged and r[0] - merged[-1][1] < 28:
            merged[-1] = (merged[-1][0], r[1])
        else:
            merged.append(list(r))
    ov = im.crop((0, max(0, y0 - 80), im.width, min(im.height, y1 + 40)))
    d = ImageDraw.Draw(ov)
    os.makedirs(outdir, exist_ok=True)
    for i, (a, b) in enumerate(merged, 1):
        pad = 12
        x0, x1 = max(0, a - pad), min(im.width, b + pad)
        t = im.crop((x0, y0, x1, y1))
        t = t.resize((t.width * 4, t.height * 4), Image.LANCZOS)
        t.save(os.path.join(outdir, f"col{i:02d}.png"))
        d.rectangle([x0, 80 if y0 >= 80 else y0, x1, ov.height - 40], outline=RED, width=4)
        d.text((x0 + 4, 8), str(i), fill=RED)
    ovp = os.path.join(outdir, "_cols_overview.png")
    if ov.width > 1600:
        ov = ov.resize((1600, int(ov.height * 1600 / ov.width)), Image.LANCZOS)
    ov.save(ovp)
    print(f"{len(merged)} cols ->", outdir, "先 Read", ovp, "核对框位")

def tiles(img_path, spec_path, outdir="."):
    im = load(img_path)
    spec = json.load(open(spec_path))
    ov = im.copy()
    d = ImageDraw.Draw(ov)
    os.makedirs(outdir, exist_ok=True)
    for name, (x0, y0, x1, y1) in spec.items():
        t = im.crop((x0, y0, x1, y1))
        t = t.resize((t.width * 3, t.height * 3), Image.LANCZOS)
        safe = name.split("·")[0]
        t.save(os.path.join(outdir, f"tile_{safe}.png"))
        d.rectangle([x0, y0, x1, y1], outline=RED, width=6)
        d.text((x0 + 6, y0 - 34 if y0 > 40 else y1 + 6), name, fill=RED)
    ovp = os.path.join(outdir, "_tiles_overview.png")
    if ov.width > 1600:
        ov = ov.resize((1600, int(ov.height * 1600 / ov.width)), Image.LANCZOS)
    ov.save(ovp)
    print(len(spec), "tiles ->", outdir, "先 Read", ovp, "核对框位再用裁片")

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "grid": grid(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
    elif cmd == "cols": cols(sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), sys.argv[5] if len(sys.argv) > 5 else ".")
    elif cmd == "tiles": tiles(sys.argv[2], sys.argv[3], sys.argv[4] if len(sys.argv) > 4 else ".")
    else: print(__doc__ or "grid|cols|tiles")
