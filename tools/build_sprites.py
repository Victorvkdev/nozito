#!/usr/bin/env python3
"""Gera src/art/sprites.js a partir de formas + desenhos em texto.

1 char = 1 pixel, '.' = transparente. Chars = paleta do docs/ARTSTYLE.md.
Uso: python3 tools/build_sprites.py
"""
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "art" / "sprites.js"

PALETTE = {
    "k": "#0e0b16", "K": "#181225", "b": "#271f3b", "B": "#372c55",
    "h": "#4b3a78", "H": "#8b6fd1", "u": "#4a2a9e", "v": "#7c4dff",
    "V": "#a78bfa", "l": "#ddd0ff", "w": "#f4f1ea", "W": "#c4bccf",
    "G": "#b07d23", "g": "#f5c542", "y": "#fff2b0", "N": "#4f4a66",
    "j": "#8a85a6", "X": "#9a93b0", "R": "#741a2e", "r": "#c2334a",
    "t": "#ff6b81", "M": "#2c4a37", "m": "#4a7a5a", "n": "#7fae6e",
    "e": "#3d2a1d", "o": "#6b4a2f", "O": "#946b43", "T": "#c9a36a",
    "f": "#ff8a3d", "F": "#ffd27a", "C": "#2f8fc0", "c": "#6fe3ff",
    "ç": "#e98aa6", "ñ": "#e2c27a", "ã": "#3a2d5c",
}

# ---------------------------------------------------------------- utilidades

def blank(w, h):
    return [["." for _ in range(w)] for _ in range(h)]


def to_rows(g):
    return ["".join(r) for r in g]


def from_rows(rows):
    return [list(r) for r in rows]


def copy(g):
    return [r[:] for r in g]


def put(g, pts, ch):
    for x, y in pts:
        if 0 <= y < len(g) and 0 <= x < len(g[0]):
            g[y][x] = ch


def outline(g, ch="k"):
    h, w = len(g), len(g[0])
    out = copy(g)
    for y in range(h):
        for x in range(w):
            if g[y][x] != ".":
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and g[ny][nx] not in (".", ch):
                    out[y][x] = ch
                    break
    return out


def shift(g, dx=0, dy=0):
    h, w = len(g), len(g[0])
    out = blank(w, h)
    for y in range(h):
        for x in range(w):
            sx, sy = x - dx, y - dy
            if 0 <= sx < w and 0 <= sy < h:
                out[y][x] = g[sy][sx]
    return out


def check(name, frames):
    w, h = len(frames[0][0]), len(frames[0])
    for f in frames:
        assert len(f) == h, f"{name}: altura diferente"
        for row in f:
            assert len(row) == w, f"{name}: largura diferente em {row!r}"
            for ch in row:
                assert ch == "." or ch in PALETTE, f"{name}: cor fora da paleta {ch!r}"
    return {"w": w, "h": h, "frames": frames}

# ---------------------------------------------------------------- Nózito 32×32

HEAD = (17.0, 11.5, 8.8)          # cx, cy, r
BODY = (15.0, 21.0, 10.2, 6.8)    # cx, cy, rx, ry
EYE = (19, 8)                     # canto sup. esq. do olho 5×5


def crow_body():
    g = blank(32, 32)
    hx, hy, hr = HEAD
    bx, by, brx, bry = BODY
    for y in range(32):
        for x in range(32):
            px, py = x + 0.5, y + 0.5
            in_head = (px - hx) ** 2 + (py - hy) ** 2 <= hr * hr
            in_body = ((px - bx) / brx) ** 2 + ((py - by) / bry) ** 2 <= 1
            if not (in_head or in_body):
                continue
            if in_head:
                light = ((px - hx) + (py - hy)) / hr
            else:
                light = ((px - bx) / brx + (py - by) / bry)
            g[y][x] = "B" if light < -0.95 else ("K" if light > 0.85 else "b")
    # brilho das penas na cabeça
    put(g, [(12, 6), (13, 5), (14, 5)], "h")
    # asa
    for y in range(17, 25):
        for x in range(6, 16):
            if ((x + 0.5 - 10.5) / 4.6) ** 2 + ((y + 0.5 - 20.5) / 3.4) ** 2 <= 1:
                g[y][x] = "K"
    put(g, [(8, 18), (9, 18), (10, 17), (11, 17), (12, 17), (13, 18)], "h")
    put(g, [(7, 19), (14, 19)], "h")
    put(g, [(8, 23), (9, 24), (10, 24), (11, 24), (12, 23)], "k")
    # barriga um pouco mais clara
    put(g, [(17, 23), (18, 23), (19, 22), (18, 24), (19, 24), (20, 23)], "B")
    return g


def add_tuft(g, droop=False):
    if droop:
        put(g, [(13, 3), (12, 3), (11, 4), (14, 2)], "b")
    else:
        put(g, [(15, 1), (15, 2), (16, 2), (18, 1), (18, 2), (17, 2)], "b")
        put(g, [(15, 1), (18, 1)], "h")


def add_beak(g, open_=False):
    if open_:
        put(g, [(26, 10), (27, 10), (26, 11), (27, 11), (28, 11), (29, 11)], "j")
        put(g, [(26, 12), (27, 12), (28, 12)], "k")
        put(g, [(26, 13), (27, 13), (28, 13), (26, 14), (27, 14)], "N")
    else:
        put(g, [(26, 11), (27, 11), (28, 11), (26, 12), (27, 12), (28, 12), (29, 12)], "j")
        put(g, [(26, 13), (27, 13), (28, 13)], "N")


def add_feet(g):
    put(g, [(12, 27), (17, 27)], "N")
    put(g, [(11, 28), (12, 28), (13, 28), (16, 28), (17, 28), (18, 28)], "X")


EYE_OPEN = [
    ".www.",
    "wwlvw",
    "wwvvw",
    "wwvuw",
    ".www.",
]


def stamp(g, pattern, ox, oy):
    for j, row in enumerate(pattern):
        for i, ch in enumerate(row):
            if ch != ".":
                put(g, [(ox + i, oy + j)], ch)


def eye_open(g):
    stamp(g, EYE_OPEN, *EYE)


def eye_closed(g):
    stamp(g, ["....", "....", "HHHHH"], *EYE)


def eye_happy(g):  # ^ ^
    stamp(g, ["..H..", ".H.H.", "H...H"], EYE[0], EYE[1] + 1)


def eye_half(g):
    stamp(g, ["HHHHH", "wwvvw", ".wvu."], EYE[0], EYE[1] + 2)


def eye_x(g):
    stamp(g, ["l...l", ".l.l.", "..l..", ".l.l.", "l...l"], *EYE)


def cheek(g, big=False):
    pts = [(21, 14), (22, 14)]
    if big:
        pts += [(20, 14), (21, 15), (22, 15), (23, 14)]
    put(g, pts, "ç")


def crow(eye="open", beak_open=False, droop=False, big_cheek=False, messy=False):
    g = crow_body()
    add_tuft(g, droop)
    add_beak(g, beak_open)
    add_feet(g)
    g = outline(g)
    {"open": eye_open, "closed": eye_closed, "happy": eye_happy,
     "half": eye_half, "x": eye_x}[eye](g)
    cheek(g, big_cheek)
    if messy:
        put(g, [(7, 14), (24, 26), (5, 21)], "h")
    return g


def squash(g):
    h, w = len(g), len(g[0])
    out = blank(w, h)
    base = 29
    for y in range(h):
        for x in range(w):
            sy = base - round((base - y) / 0.82)
            sx = 16 + round((x - 16) / 1.12)
            if 0 <= sy < h and 0 <= sx < w:
                out[y][x] = g[sy][sx]
    return out


def body_only_shift(g, dy):
    """Respira: tudo menos os pés desce dy px."""
    feet_rows = {27, 28, 29}
    out = blank(len(g[0]), len(g))
    for y in range(len(g)):
        for x in range(len(g[0])):
            if y in feet_rows:
                if g[y][x] != ".":
                    out[y][x] = g[y][x]
                continue
            ny = y + dy
            if 0 <= ny < len(g) and ny not in feet_rows and g[y][x] != ".":
                out[ny][x] = g[y][x]
    return outline_fix(out)


def outline_fix(g):
    return g


SPRITES = {}


def crow_frames():
    base = crow()
    SPRITES["crow_idle"] = check("crow_idle", [to_rows(base), to_rows(crow(eye="closed"))])
    happy = crow(eye="happy", big_cheek=True)
    SPRITES["crow_happy"] = check("crow_happy", [to_rows(happy), to_rows(shift(happy, 0, -2))])
    SPRITES["crow_eat"] = check("crow_eat", [to_rows(base), to_rows(crow(beak_open=True))])
    SPRITES["crow_pet"] = check("crow_pet", [to_rows(crow(eye="happy", big_cheek=True))])
    hungry = crow(eye="half", droop=True)
    SPRITES["crow_hungry"] = check("crow_hungry", [to_rows(hungry), to_rows(shift(hungry, 0, 1))])
    weak = crow(eye="half", droop=True, messy=True)
    SPRITES["crow_weak"] = check("crow_weak", [to_rows(weak), to_rows(shift(weak, 1, 0))])
    SPRITES["crow_dead"] = check("crow_dead", [to_rows(crow(eye="x", droop=True))])
    SPRITES["crow_squash"] = check("crow_squash", [to_rows(squash(base))])

# ---------------------------------------------------------------- desenhos à mão

HAND = {
    # Comidas e ícones 12×12
    "food_minhoca": [[
        "............",
        "............",
        "........kk..",
        ".......kçtk.",
        "......kçtwk.",
        "..kk..kçtk..",
        ".kçtkkçtk...",
        "kçtçtçtk....",
        "kçoçoçk.....",
        ".kkkkk......",
        "............",
        "............",
    ]],
    "food_petisco_brilhante": [[
        ".....y......",
        ".....y......",
        "...kkkkk....",
        "..kgyyggk.yy",
        ".kgyygggGk..",
        ".kgyggggGk..",
        ".kgggggGGk..",
        ".kGgggGGGk..",
        "..kGGGGGk...",
        "...kkkkk....",
        "y...........",
        "............",
    ]],
    "food_banquete": [[
        "....y.......",
        "...kkkk..y..",
        "..kooOTk....",
        ".kotOTnmk...",
        ".kooOmnmk...",
        "kkkkkkkkkk..",
        "kwWWWWWWWWk.",
        ".kWwwwwwWk..",
        "..kkkkkkk...",
        "............",
        "............",
        "............",
    ]],
    "icon_seed": [[
        "............",
        "......kk....",
        ".....kmnk...",
        "....kmnynk..",
        "...kmmnnnk..",
        "...kMmmnnk..",
        "...kMMmmnk..",
        "....kMMmk...",
        ".....kkk....",
        "............",
        "............",
        "............",
    ]],
    "icon_heart": [[
        ".kk.kk.",
        "kVvkvvk",
        "kVvvvvk",
        ".kvvvk.",
        "..kvk..",
        "...k...",
    ]],
    "consumable_pedra_ressurreicao": [[
        ".......l........",
        "................",
        "...l...kk...l...",
        "......kVlk......",
        ".....kVlVvk.....",
        "....kVlVvvuk....",
        "....kVVvvvuk....",
        ".l..kVvvvuuk..l.",
        "....kvvvvuuk....",
        "....kvvvuuuk....",
        ".....kvvuuk.....",
        "......kvuk......",
        ".......kk.......",
        "................",
        "...l.......l....",
        "................",
    ]],
    "hat_cartola": [[
        "................",
        "....kkkkkkkk....",
        "....kKbbbbBk....",
        "....kKbbbbBk....",
        "....kKbbbbBk....",
        "....kKbbbbBk....",
        "....kvvvvvVk....",
        "....kuuvvvvk....",
        "..kkkkkkkkkkkk..",
        "..kKKbbbbbbBBk..",
        "...kkkkkkkkkk...",
        "................",
    ]],
    "hat_coroa_tampinha": [[
        "................",
        "................",
        "...k...kk...k...",
        "..kyk.kyyk.kyk..",
        "..kgk.kggk.kgk..",
        "..kgGkgGGgkgGk..",
        "..kggggggggggk..",
        "..kgrgggcgggrk..",
        "..kGgGgGgGgGGk..",
        "..kkkkkkkkkkkk..",
        "................",
        "................",
    ]],
    "grave": [[
        "................",
        "......kkkk......",
        "....kkWWWWkk....",
        "...kWWWjWWWjk...",
        "...kWWjjjWWjk...",
        "...kWWWjWWWjk...",
        "...kWWWjWWWjk...",
        "...kWWWWWWWjk...",
        "...kWjjjjjjjk...",
        "...kWjjjjjjNk...",
        "...kWjjjjjjNk...",
        "...kjjjjjjjNk...",
        "..kkkkkkkkkkkk..",
        ".kmnmMmnmmMnmMk.",
        ".kkkkkkkkkkkkkk.",
        "................",
    ]],
}


def nest(w=48, h=16, kind="default"):
    g = blank(w, h)
    cx, cy, rx, ry = w / 2, 4.0, w / 2 - 1, 11.0
    for y in range(h):
        for x in range(w):
            px, py = x + 0.5, y + 0.5
            if py < 5:
                continue
            if ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2 <= 1:
                stripe = (x * 3 + y * 5) % 7
                g[y][x] = "O" if stripe < 2 else ("o" if stripe < 5 else "e")
                if y == 5 or y == 6:
                    g[y][x] = "ñ" if (x + y) % 3 else "T"
    for x in range(3, w - 3, 5):
        put(g, [(x, 4), (x + 1, 4)], "T")
    if kind == "galhos":
        for x in range(2, w - 2, 7):
            put(g, [(x, 3), (x + 1, 2), (x + 2, 2)], "o")
    return outline(g)


def wallpaper_icon():
    return [
        "kkkkkkkkkkkk",
        "kKKKKKKKlKKk",
        "kKlKKKKKKKKk",
        "kbbbbbbbWWbk",
        "kbbbVbbWwwWk",
        "kbbbbbbWwwWk",
        "kããlãããbWWbk",
        "kããããããããããk",
        "kãããããVããããk",
        "kuuuuuuuuuuk",
        "kuuuuuuuuuuk",
        "kkkkkkkkkkkk",
    ]


def main():
    crow_frames()
    for name, frames in HAND.items():
        SPRITES[name] = check(name, frames)
    SPRITES["scene_nest"] = check("scene_nest", [to_rows(nest())])
    SPRITES["nest_galhos"] = check("nest_galhos", [to_rows(nest(kind="galhos"))])
    SPRITES["wallpaper_ceu_estrelado"] = check("wallpaper_ceu_estrelado", [wallpaper_icon()])
    OUT.parent.mkdir(parents=True, exist_ok=True)
    body = (
        "// GERADO por tools/build_sprites.py — não editar à mão.\n"
        "// 1 char = 1 pixel, '.' = transparente. Paleta: docs/ARTSTYLE.md.\n\n"
        f"export const PALETTE = {json.dumps(PALETTE, ensure_ascii=False, indent=2)};\n\n"
        f"export const SPRITES = {json.dumps(SPRITES, ensure_ascii=False, indent=2)};\n"
    )
    OUT.write_text(body, encoding="utf-8")
    print(f"{len(SPRITES)} sprites → {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
