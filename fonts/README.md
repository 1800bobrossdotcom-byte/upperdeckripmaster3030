# fonts — vendored, subset, self-hosted

Three faces, ~43 KB total. **Self-hosted on purpose:** the whole repo already refuses external
requests at runtime (the SuperRare embed is sandboxed to an opaque origin where a font CDN simply
fails, and a page that silently swaps to Arial when a request is blocked is a page whose design is
contingent on someone else's uptime). These are files in the repo, so the type is the type.

## What each one does

| var | face | role |
| --- | --- | --- |
| `--display` | **Bungee** | signage. Marquees, buttons, chips, headings, the loading screen. Built to be read across a room, which is exactly what an arcade cabinet's text is for. |
| `--fat` | **Anton** | condensed impact. The big HUD numerals — frags, ammo, timer, health. Tall and narrow, so a three-digit number fits where a wide face would wrap. |
| `--mono` | **Share Tech Mono** | data. Labels, readouts, the killfeed, comms — anything that is a machine talking. |

The split is the point: signage / impact / data are three different jobs, and doing them with one
family (`Arial Black` and `Courier New`, which is what this was) means the HUD has no hierarchy
beyond size.

## Licence — all three SIL Open Font License 1.1

OFL permits embedding, web use, and commercial use, including in a project that sells things.
Verified by reading each family's own `OFL.txt` at the source, not assumed from "it's on Google
Fonts".

| file | family | copyright | source |
| --- | --- | --- | --- |
| `bungee.woff2` | Bungee | Copyright 2023 The Bungee Project Authors — David Jonathan Ross | <https://github.com/djrrb/Bungee> · [google/fonts ofl/bungee](https://github.com/google/fonts/tree/main/ofl/bungee) |
| `anton.woff2` | Anton | Copyright 2020 The Anton Project Authors | <https://github.com/googlefonts/AntonFont> · [google/fonts ofl/anton](https://github.com/google/fonts/tree/main/ofl/anton) |
| `sharetechmono.woff2` | Share Tech Mono | Copyright (c) 2012 Carrois Type Design, Ralph du Carrois — Reserved Font Name "Share" | [google/fonts ofl/sharetechmono](https://github.com/google/fonts/tree/main/ofl/sharetechmono) |

⚠ Share Tech Mono carries a **Reserved Font Name** ("Share"). Under OFL that means a MODIFIED
version may not be distributed under that name. Subsetting is not modification of the design, and
the family name is unchanged, so shipping it as-is is fine — but if the outlines are ever edited,
it has to be renamed. Do not rename it merely for being subset.

## Rebuilding

Subset to the characters this site actually uses (Basic Latin + the typographic and symbol
characters in the UI), then compressed to woff2:

```sh
pip install fonttools brotli
RANGE="U+0020-007E,U+00A0,U+00B0,U+00B7,U+00D7,U+2013,U+2014,U+2018,U+2019,U+201C,U+201D,\
U+2022,U+2026,U+2039,U+203A,U+2190-2193,U+25B8,U+25C8,U+25CE,U+2605,U+2606,U+2713,U+258C,U+00AB,U+00BB"
python3 -m fontTools.subset Bungee-Regular.ttf --unicodes="$RANGE" --layout-features='*' \
  --flavor=woff2 --output-file=fonts/bungee.woff2 --desubroutinize --name-IDs='*'
```

`--name-IDs='*'` is deliberate: it keeps the copyright, licence and family strings inside the
binary, so the file carries its own provenance even if it is copied out of this repo.

⚠ The subset range has no emoji and no CJK. Emoji in the UI (🔥 ♪ 🔊 ⏸) fall through to the system
emoji font, which is what should happen — none of these three has colour glyphs. If copy ever
needs an accented character outside Latin-1's common set, widen `RANGE` and rebuild, or it will
render as tofu.
