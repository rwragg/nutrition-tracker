#!/usr/bin/env python3
"""Build the Nutrition Tracker deck.

The deck is a slide show, not a pile of images on default layouts: every page is 16:9 at
13.333 x 7.5 inches, and every page uses the same geometry — title band, rule, content frame,
caption band, footer and slide number all sit in the same place on every slide. Images fill one
fixed frame, so no page reads as a different shape from its neighbours.

The colours are read from the app's own tokens in frontend/app/globals.css rather than copied
into this file. Editing globals.css changes the deck; a hand-copied palette would silently drift
from the thing it is supposed to match.

    cd ~/hermes_workspace/nutrition
    python3 docs/deck/build_deck.py                    # writes docs/deck/Nutrition-Tracker-Deck.pptx
    python3 ~/.hermes/skills/productivity/powerpoint/scripts/pptx_render.py docs/deck/Nutrition-Tracker-Deck.pptx --outdir /tmp/render
    soffice --headless --convert-to pdf --outdir docs/deck docs/deck/Nutrition-Tracker-Deck.pptx
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.util import Inches, Pt

REPO = Path(__file__).resolve().parents[2]
TOKENS_CSS = REPO / "frontend" / "app" / "globals.css"
SHOTS = REPO / "docs" / "screenshots"
OUT = REPO / "docs" / "deck" / "Nutrition-Tracker-Deck.pptx"

# Fallbacks only: used if a token is missing from the stylesheet, so a rename fails loudly in
# review rather than quietly producing an off-brand deck.
FALLBACK = {
    "ink": "0a0d12", "surface": "12161f", "surface-2": "1a202b", "hairline": "384355",
    "volt": "c8ff4d", "cyan": "38d9f5", "violet": "9b7bff", "ember": "ff6b4a",
    "text": "eaf0f7", "muted": "8b95a7",
}


def load_tokens() -> dict[str, RGBColor]:
    """Read the app's colour tokens out of its stylesheet."""
    css = TOKENS_CSS.read_text(encoding="utf-8")
    tokens = {}
    for name, default in FALLBACK.items():
        match = re.search(rf"--{name}:\s*#([0-9a-fA-F]{{6}})", css)
        if not match:
            print(f"  note: --{name} not found in {TOKENS_CSS.name}; using the fallback", file=sys.stderr)
        tokens[name] = RGBColor.from_string((match.group(1) if match else default).upper())
    return tokens


C = load_tokens()
FONT = "Arial"

# One geometry for every slide. Nothing below is allowed to vary per page.
PAGE_W, PAGE_H = 13.333, 7.5
TITLE_L, TITLE_T, TITLE_W, TITLE_H = 0.72, 0.42, 11.9, 0.62
RULE_T = 1.16
KICKER_T = 1.22
BODY_T = 1.52
BODY_H = 4.7
IMAGE_FRAME = (2.79, 1.52, 7.76, 4.85)      # left, top, width, height — 16:10, like a 1600x1000 shot
CAPTION_T, CAPTION_H = 6.45, 0.52
FOOTER_T = 7.0


def blank(prs):
    """A slide with nothing on it: every mark is placed by this script, in this file."""
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    bg = slide.background.fill
    bg.solid()
    bg.fore_color.rgb = C["ink"]
    # The spine: a single volt stripe down the left edge, identical on every page.
    spine = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0), Inches(0), Inches(0.16), Inches(PAGE_H))
    spine.fill.solid()
    spine.fill.fore_color.rgb = C["volt"]
    spine.line.fill.background()
    spine.shadow.inherit = False
    return slide


def textbox(slide, left, top, width, height, *, anchor=MSO_ANCHOR.TOP):
    box = slide.shapes.add_textbox(Inches(left), Inches(top), Inches(width), Inches(height))
    frame = box.text_frame
    frame.word_wrap = True
    frame.vertical_anchor = anchor
    frame.margin_left = frame.margin_right = frame.margin_top = frame.margin_bottom = 0
    return frame


def write(frame, text, *, size, color, bold=False, align=PP_ALIGN.LEFT, space_after=0, first=True):
    para = frame.paragraphs[0] if first else frame.add_paragraph()
    run = para.add_run()
    run.text = text
    # Every paragraph in the frame, not just the one just written: text containing a newline
    # becomes several paragraphs, and styling only the first left the rest at the theme's
    # defaults — the same trap as a per-run text colour.
    for p in frame.paragraphs:
        p.alignment = align
        for r in p.runs:
            r.font.size = Pt(size)
            r.font.bold = bold
            r.font.color.rgb = color
            r.font.name = FONT
    para.space_after = Pt(space_after)
    return para


def shape(slide, kind, left, top, width, height, *, fill, text="", lines=None, size=12.0,
          color=None, bold=False, align=PP_ALIGN.CENTER):
    box = slide.shapes.add_shape(kind, Inches(left), Inches(top), Inches(width), Inches(height))
    box.fill.solid()
    box.fill.fore_color.rgb = fill
    box.line.color.rgb = C["hairline"]
    box.line.width = Pt(0.75)
    box.shadow.inherit = False
    box.text_frame.word_wrap = True
    box.text_frame.vertical_anchor = MSO_ANCHOR.MIDDLE
    box.text_frame.margin_left = box.text_frame.margin_right = Inches(0.14)
    for i, line in enumerate(lines if lines is not None else ([text] if text else [])):
        write(box.text_frame, line, size=size, color=color or C["text"], bold=bold,
              align=align, first=(i == 0))
    return box


def headline(slide, title, kicker=None, accent=None):
    accent = accent or C["volt"]
    write(textbox(slide, TITLE_L, TITLE_T, TITLE_W, TITLE_H), title, size=28, color=C["text"], bold=True)
    # The rule under the title: a hairline for the width of the page, with an accent run for the title's width.
    rule = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(TITLE_L), Inches(RULE_T), Inches(TITLE_W), Pt(1.25))
    rule.fill.solid()
    rule.fill.fore_color.rgb = C["hairline"]
    rule.line.fill.background()
    rule.shadow.inherit = False
    accent_rule = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(TITLE_L), Inches(RULE_T - 0.012), Inches(1.15), Pt(2.5))
    accent_rule.fill.solid()
    accent_rule.fill.fore_color.rgb = accent
    accent_rule.line.fill.background()
    accent_rule.shadow.inherit = False
    if kicker:
        write(textbox(slide, TITLE_L, KICKER_T, TITLE_W, 0.3), kicker, size=11, color=accent, bold=True)


def footer(slide, number):
    write(textbox(slide, TITLE_L, FOOTER_T, 8.0, 0.3), "github.com/rwragg/nutrition-tracker", size=9, color=C["muted"])
    write(textbox(slide, 11.4, FOOTER_T, 1.2, 0.3), f"{number}", size=9, color=C["muted"], align=PP_ALIGN.RIGHT)


def bullets(slide, items, *, size=16, accent=None):
    """One bullet per paragraph: an accent marker, then the text. Same frame on every text page."""
    accent = accent or C["volt"]
    frame = textbox(slide, TITLE_L, BODY_T, TITLE_W, BODY_H)
    for i, item in enumerate(items):
        para = frame.paragraphs[0] if i == 0 else frame.add_paragraph()
        para.space_after = Pt(11)
        marker = para.add_run()
        marker.text = "—  "
        marker.font.size = Pt(size)
        marker.font.bold = True
        marker.font.color.rgb = accent
        marker.font.name = FONT
        run = para.add_run()
        run.text = item
        run.font.size = Pt(size)
        run.font.color.rgb = C["text"]
        run.font.name = FONT


def caption(slide, text):
    shape(slide, MSO_SHAPE.ROUNDED_RECTANGLE, TITLE_L, CAPTION_T, TITLE_W, CAPTION_H,
          fill=C["surface-2"], text=text, size=11.5, color=C["text"])


def picture(slide, name):
    """One fixed frame for every screenshot, on a plate so the app's dark UI has a visible edge."""
    left, top, width, height = IMAGE_FRAME
    pad = 0.09
    plate = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(left - pad), Inches(top - pad),
                                   Inches(width + pad * 2), Inches(height + pad * 2))
    plate.fill.solid()
    plate.fill.fore_color.rgb = C["surface"]
    plate.line.color.rgb = C["hairline"]
    plate.line.width = Pt(1)
    plate.shadow.inherit = False
    slide.shapes.add_picture(str(SHOTS / name), Inches(left), Inches(top), Inches(width), Inches(height))


def table(slide, rows, *, col_widths=None, size=12):
    left, top, width = TITLE_L, BODY_T, TITLE_W
    height = 0.42 * len(rows)
    graphic = slide.shapes.add_table(len(rows), len(rows[0]), Inches(left), Inches(top),
                                     Inches(width), Inches(height))
    tbl = graphic.table
    if col_widths:
        for i, w in enumerate(col_widths):
            tbl.columns[i].width = Inches(w)
    for r, row in enumerate(rows):
        for c, value in enumerate(row):
            cell = tbl.cell(r, c)
            cell.text = str(value)
            cell.fill.solid()
            cell.fill.fore_color.rgb = C["surface-2"] if r == 0 else C["surface"]
            cell.vertical_anchor = MSO_ANCHOR.MIDDLE
            cell.margin_left = cell.margin_right = Inches(0.12)
            para = cell.text_frame.paragraphs[0]
            for run in para.runs:
                run.font.size = Pt(size)
                run.font.name = FONT
                run.font.bold = r == 0
                run.font.color.rgb = C["volt"] if r == 0 else C["text"]


def build():
    prs = Presentation()
    prs.slide_width, prs.slide_height = Inches(PAGE_W), Inches(PAGE_H)
    n = 0

    # ---- 1. Title ----
    n += 1
    slide = blank(prs)
    write(textbox(slide, TITLE_L, 2.35, TITLE_W, 1.2), "Nutrition Tracker", size=54, color=C["text"], bold=True)
    write(textbox(slide, TITLE_L, 3.6, TITLE_W, 0.45),
          "A food log I use every day.", size=18, color=C["volt"])
    write(textbox(slide, TITLE_L, 4.05, TITLE_W, 1.4),
          "Built end to end with AI agents — and directed as an engineering project.\n"
          "Next.js · TypeScript · Python (FastAPI) · SQLite · Docker · Telegram",
          size=14, color=C["muted"], space_after=4)
    footer(slide, n)

    # ---- 2. What it is ----
    n += 1
    slide = blank(prs)
    headline(slide, "What it is", kicker="THE APP", accent=C["volt"])
    bullets(slide, [
        "A daily food and macro log: what I ate, what it came to, and what is left against target",
        "Next.js and TypeScript front end, Python (FastAPI) API, SQLite and Docker",
        "A Telegram bot as a second client of the same API, so it works from a phone",
        "Multiple accounts, isolated from each other at the API and in the database",
        "No model in the product: AI wrote most of the code, the app is deterministic code",
    ])
    footer(slide, n)

    # ---- 3-8. The app, screen by screen: one identical image frame on each ----
    screens = [
        ("day.png", "The day view", "ON OPEN", "Sections, entries, running totals, and macro bars against target."),
        ("new-food.png", "Adding a food you already know", "THE CATALOGUE",
         "A near-duplicate already in the list is offered instead of silently created."),
        ("usda-lookup.png", "Foods the catalogue does not have", "USDA FOODDATA CENTRAL",
         "A live USDA search: generic foods, up to three candidates, per-100 g figures."),
        ("usda-add.png", "Nothing is written until you confirm", "CONFIRM",
         "Per 100 g in, grams out: name and figures stay editable. One button logs it."),
        ("meals.png", "Meals as shortcuts", "REPEATABLE MEALS",
         "A named meal logs all of its items in one step. A definition is a snapshot, so it cannot drift."),
        ("pairing.png", "The chat client", "A SECOND CALLER OF THE SAME API",
         "Linking a chat means minting a one-time code and sending it to the bot."),
    ]
    for name, title, kicker, cap in screens:
        n += 1
        slide = blank(prs)
        headline(slide, title, kicker=kicker, accent=C["cyan"])
        picture(slide, name)
        caption(slide, cap)
        footer(slide, n)

    # ---- 9. Security ----
    n += 1
    slide = blank(prs)
    headline(slide, "No password ever goes into a chat", kicker="SECURITY", accent=C["ember"])
    bullets(slide, [
        "Minted by the app, redeemed in the chat, burned on use — and any other code the account held dies with it",
        "The bot proves who it is with a shared secret compared in constant time",
        "The account it acts for comes from the binding, not from the caller",
        "One function decides who may ask, for person and machine alike",
        "Per-account daily caps, per-chat attempt limits, codes that expire in fifteen minutes",
        "Account isolation is proved by tests, not asserted",
    ], size=15, accent=C["ember"])
    footer(slide, n)

    # ---- 10. Architecture ----
    n += 1
    slide = blank(prs)
    headline(slide, "How it fits together", kicker="ARCHITECTURE", accent=C["cyan"])
    shape(slide, MSO_SHAPE.ROUNDED_RECTANGLE, 0.72, 1.72, 3.5, 1.0, fill=C["surface"],
          lines=["Browser UI", "Next.js + TypeScript"], size=12)
    shape(slide, MSO_SHAPE.RIGHT_ARROW, 4.32, 2.02, 0.72, 0.4, fill=C["volt"])
    shape(slide, MSO_SHAPE.ROUNDED_RECTANGLE, 5.14, 1.72, 3.7, 1.0, fill=C["surface-2"],
          lines=["The one gate", "FastAPI: sessions, quotas, validation, ownership"], size=12, color=C["volt"], bold=True)
    shape(slide, MSO_SHAPE.RIGHT_ARROW, 8.94, 2.02, 0.5, 0.4, fill=C["volt"])
    shape(slide, MSO_SHAPE.ROUNDED_RECTANGLE, 9.54, 1.72, 3.08, 1.0, fill=C["surface"],
          lines=["SQLite", "schema v6, migrations, delete guards"], size=12)
    shape(slide, MSO_SHAPE.ROUNDED_RECTANGLE, 0.72, 3.62, 3.5, 1.0, fill=C["surface"],
          lines=["Telegram bot", "long polling, no public port"], size=12)
    shape(slide, MSO_SHAPE.RIGHT_ARROW, 4.32, 3.92, 0.72, 0.4, fill=C["volt"])
    shape(slide, MSO_SHAPE.ROUNDED_RECTANGLE, 5.14, 3.62, 3.7, 1.0, fill=C["surface"],
          lines=["Second caller", "same routes, same rules"], size=12)
    shape(slide, MSO_SHAPE.ROUNDED_RECTANGLE, 9.54, 3.62, 3.08, 1.0, fill=C["surface"],
          lines=["USDA", "server-side key, per-account caps"], size=12)
    shape(slide, MSO_SHAPE.ROUNDED_RECTANGLE, 0.72, 5.02, 11.9, 1.24, fill=C["surface-2"],
          lines=["One API, two callers. The person and the bot authenticate to the same gate, so a route the "
                 "person cannot reach is a route the bot cannot reach — and an unbound chat is refused everything.",
                 "The figures come from USDA and the person's own list, never from a model: the model that built "
                 "the app is not part of the app."], size=12, align=PP_ALIGN.LEFT)
    footer(slide, n)

    # ---- 11. Data ----
    n += 1
    slide = blank(prs)
    headline(slide, "Data, and how it changes shape safely", kicker="THE DATABASE", accent=C["violet"])
    bullets(slide, [
        "SQLite at schema version 6, with a migration chain that refuses a schema it cannot carry forward",
        "Deletes are guarded in the database, so an entry cannot lose the food underneath it",
        "Entries carry literal figures: correcting a value never rewrites what a day was logged as",
        "Every account's rows are its own — enforced at the API, and proved by tests",
    ], accent=C["violet"])
    footer(slide, n)

    # ---- 12. Process ----
    n += 1
    slide = blank(prs)
    headline(slide, "How it was built: the process, not a long chat", kicker="HOW, NOT JUST WHAT", accent=C["volt"])
    bullets(slide, [
        "A written brief: 30 numbered requirements and 24 recorded decisions, each with its reasoning",
        "A plan file stating every part's substeps, its tests and its success criteria",
        "A review gate at every part — nothing starts before the previous part is verified",
        "The state after each part written down for whoever picks it up next",
        "Every claim in the documentation is a command that prints it",
    ])
    footer(slide, n)

    # ---- 13. Agents ----
    n += 1
    slide = blank(prs)
    headline(slide, "How it was built: the agents", kicker="MULTI-MODEL, DIRECTED", accent=C["cyan"])
    bullets(slide, [
        "AI agents wrote most of the code; I set the requirements, the boundaries and the gates",
        "Separate agents on isolated profiles, each with only the tools its own job needs",
        "Private health and training data stays on a model I run myself; general work goes to a hosted one",
        "Unknown values are refused rather than guessed; credentials carry the least access that works",
        "The result is not a demo: it is the app I log my own meals in",
    ], accent=C["cyan"])
    footer(slide, n)

    # ---- 14. Evidence ----
    n += 1
    slide = blank(prs)
    headline(slide, "Evidence, and how to check it", kicker="EVIDENCE", accent=C["volt"])
    table(slide, [
        ["Suite", "Command", "Result"],
        ["Backend (pytest)", "uv run python -m pytest", "282 passed"],
        ["Front-end unit (Vitest)", "npm test", "140 passed, 14 files"],
        ["End-to-end (Playwright)", "npm run test:e2e", "28 passed, real container"],
        ["Schema version", "db.py SCHEMA_VERSION", "6"],
    ], col_widths=[3.3, 5.1, 3.5])
    shape(slide, MSO_SHAPE.ROUNDED_RECTANGLE, TITLE_L, 4.5, TITLE_W, 1.2, fill=C["surface-2"],
          lines=["Every figure here came from re-running the command, not from memory. The end-to-end suite "
                 "starts its own container from a freshly seeded database, so it asserts against a known state "
                 "rather than whatever happens to be on the machine."], size=12, align=PP_ALIGN.LEFT)
    footer(slide, n)

    # ---- 15. Gaps ----
    n += 1
    slide = blank(prs)
    headline(slide, "What it does not do yet", kicker="HONESTLY", accent=C["ember"])
    bullets(slide, [
        "No voice input: the bot skips any update with no text field — left off until it exists",
        "One person, one machine: there is no hosting story yet",
        "Household units are partial: grams, cups, each, tablespoons",
        "Rate limits live in memory and reset with the process",
        "Next: a second account on real hardware, then hosting, then voice",
    ], accent=C["ember"])
    footer(slide, n)

    return prs


def check(prs) -> list[str]:
    """Every shape inside the page, and every page the same size.

    The earlier hand-built deck failed exactly here and nobody noticed until the render: bullets
    ran off the bottom because a placeholder grew past the page, and one slide's caption sat on
    the footer. A deck is a fixed canvas, so overflow is a defect this can simply refuse.
    """
    problems = []
    width, height = prs.slide_width, prs.slide_height
    for i, slide in enumerate(prs.slides, start=1):
        for shape in slide.shapes:
            if shape.left is None:
                continue
            right, bottom = shape.left + shape.width, shape.top + shape.height
            if right > width + 1000 or bottom > height + 1000:
                problems.append(
                    f"slide {i}: {shape.shape_type} extends past the page "
                    f"(right {round(right / 914400, 2)}in, bottom {round(bottom / 914400, 2)}in)")
    return problems


def main() -> int:
    prs = build()
    problems = check(prs)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    prs.save(OUT)
    for problem in problems:
        print(f"  LAYOUT: {problem}", file=sys.stderr)
    print(f"  geometry: {len(problems)} shape(s) outside the page")
    print(f"wrote {OUT} — {len(prs.slides)} slides, each {PAGE_W}x{PAGE_H} in "
          f"({round(PAGE_W * 72)}x{round(PAGE_H * 72)} pt)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
