# /// script
# requires-python = ">=3.10"
# dependencies = ["python-pptx>=1.0"]
# ///
"""Extract the style facts of a PowerPoint brand deck as JSON.

A brand book deck stores its colors, fonts, sizes, line widths and corner radii as data.
This reads them out, so tokens can be checked against the deck instead of eyeballed
from slide images:

    uv run scripts/extract-deck.py "Brand Guidelines.pptx" > deck.json
    uv run scripts/extract-deck.py deck.pptx --slides 45,76 --pretty

Output: the slide size, the theme's colors and fonts, every slide's shapes (position,
size, fill, line, radius, text runs with font, size and color) and speaker notes, and an
index of every color and font with the slides it appears on. The index also lists hex
values written as text, and every swatch whose label names a different color than the
one it is drawn in: places where the deck contradicts itself.

Styles a shape does not set itself are resolved the way PowerPoint does: from the
layout placeholder, then the master placeholder, then the master's text styles, then
the theme. Values that come from there are marked "inherited": true.

Geometry is on the slide's own canvas (px at 96 dpi). A deck draws examples at slide
scale, so treat sizes and radii as a cross-check for what the slide text states.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

from lxml import etree
from pptx import Presentation
from pptx.enum.dml import MSO_COLOR_TYPE, MSO_FILL_TYPE
from pptx.enum.shapes import MSO_SHAPE_TYPE
from pptx.opc.constants import RELATIONSHIP_TYPE as RT
from pptx.util import Emu

NS = {
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
}

# Placeholder type -> the master text style that formats it
TITLE_TYPES = {"TITLE", "CENTER_TITLE", "VERTICAL_TITLE"}
BODY_TYPES = {"BODY", "SUBTITLE", "OBJECT", "VERTICAL_BODY", "VERTICAL_OBJECT"}


def px(emu: int | None) -> float | None:
    return None if emu is None else round(Emu(emu).inches * 96, 2)


class Theme:
    """The deck's theme: scheme colors (dk1, accent1, ...) and the major and minor fonts."""

    def __init__(self, deck: Presentation) -> None:
        master_part = deck.slide_masters[0].part
        xml = etree.fromstring(master_part.part_related_by(RT.THEME).blob)
        self.colors: dict[str, str] = {}
        scheme = xml.find(".//a:clrScheme", NS)
        for node in scheme if scheme is not None else []:
            name = etree.QName(node).localname
            value = node.find("a:srgbClr", NS)
            system = node.find("a:sysClr", NS)
            if value is not None:
                self.colors[name] = "#" + value.get("val").upper()
            elif system is not None and system.get("lastClr"):
                self.colors[name] = "#" + system.get("lastClr").upper()
        major = xml.find(".//a:majorFont/a:latin", NS)
        minor = xml.find(".//a:minorFont/a:latin", NS)
        self.fonts = {
            "major": major.get("typeface") if major is not None else None,
            "minor": minor.get("typeface") if minor is not None else None,
        }

    def color(self, scheme_name: str) -> str | None:
        # The master's color map points text and background names at scheme slots
        aliases = {"tx1": "dk1", "tx2": "dk2", "bg1": "lt1", "bg2": "lt2"}
        return self.colors.get(aliases.get(scheme_name, scheme_name))

    def font(self, typeface: str | None) -> str | None:
        if typeface in ("+mj-lt", "+mj-ea", "+mj-cs"):
            return self.fonts["major"]
        if typeface in ("+mn-lt", "+mn-ea", "+mn-cs"):
            return self.fonts["minor"]
        return typeface


def xml_color(node: Any, theme: Theme) -> str | None:
    """A solid fill element's color: an sRGB value or a theme scheme color."""
    if node is None:
        return None
    rgb = node.find("a:srgbClr", NS)
    if rgb is not None:
        return "#" + rgb.get("val").upper()
    scheme = node.find("a:schemeClr", NS)
    if scheme is not None:
        return theme.color(scheme.get("val"))
    return None


def run_props_from(node: Any, theme: Theme) -> dict[str, Any]:
    """Font facts set on an a:rPr or a:defRPr element."""
    if node is None:
        return {}
    facts: dict[str, Any] = {}
    if node.get("sz"):
        facts["size_pt"] = int(node.get("sz")) / 100
    if node.get("b") is not None:
        facts["bold"] = node.get("b") in ("1", "true")
    latin = node.find("a:latin", NS)
    if latin is not None and latin.get("typeface"):
        facts["font"] = theme.font(latin.get("typeface"))
    color = xml_color(node.find("a:solidFill", NS), theme)
    if color:
        facts["color"] = color
    return facts


def level_defaults(container: Any, level: int, theme: Theme) -> dict[str, Any]:
    """Defaults for one paragraph level from a list-style container (a:lstStyle, p:titleStyle, ...)."""
    if container is None:
        return {}
    ppr = container.find(f"a:lvl{level + 1}pPr", NS)
    return run_props_from(ppr.find("a:defRPr", NS) if ppr is not None else None, theme)


class Inheritance:
    """Resolves a placeholder's text style the way PowerPoint does, nearest source first."""

    def __init__(self, deck: Presentation, theme: Theme) -> None:
        self.theme = theme
        tx_styles = deck.slide_masters[0].element.find("p:txStyles", NS)
        self.master_styles = {
            "title": tx_styles.find("p:titleStyle", NS) if tx_styles is not None else None,
            "body": tx_styles.find("p:bodyStyle", NS) if tx_styles is not None else None,
            "other": tx_styles.find("p:otherStyle", NS) if tx_styles is not None else None,
        }

    def chain(self, shape: Any) -> list[Any]:
        """List-style containers from the slide's own shape outwards, ending with the master text style."""
        containers = [shape.element.find(".//a:lstStyle", NS)]
        kind = "other"
        if shape.is_placeholder:
            fmt = shape.placeholder_format
            kind = "title" if fmt.type is not None and fmt.type.name in TITLE_TYPES else "body"
            layout = shape.part.slide.slide_layout
            for source in (layout, layout.slide_master):
                match = next((ph for ph in source.placeholders if ph.placeholder_format.idx == fmt.idx), None)
                if match is None and fmt.type is not None:
                    match = next((ph for ph in source.placeholders if ph.placeholder_format.type == fmt.type), None)
                if match is not None:
                    containers.append(match.element.find(".//a:lstStyle", NS))
        containers.append(self.master_styles[kind])
        return containers

    def resolve(self, shape: Any, paragraph: Any, run: Any) -> dict[str, Any]:
        own = run_props_from(run._r.find("a:rPr", NS), self.theme)
        resolved = dict(own)
        level = paragraph.level or 0
        sources = [run_props_from(paragraph._p.find("a:pPr/a:defRPr", NS), self.theme)]
        sources += [level_defaults(c, level, self.theme) for c in self.chain(shape)]
        sources.append({"font": self.theme.fonts["minor"]})
        inherited = []
        for source in sources:
            for key, value in source.items():
                if key not in resolved:
                    resolved[key] = value
                    inherited.append(key)
        if inherited:
            resolved["inherited"] = sorted(inherited)
        return resolved


def fill_of(shape: Any, theme: Theme) -> str | None:
    try:
        fill = shape.fill
        if fill.type != MSO_FILL_TYPE.SOLID:
            return None
        color = fill.fore_color
        if color.type == MSO_COLOR_TYPE.RGB:
            return "#" + str(color.rgb).upper()
        if color.type == MSO_COLOR_TYPE.SCHEME:
            # ACCENT_1 -> accent1, TEXT_1 -> tx1, BACKGROUND_1 -> bg1
            name = color.theme_color.name.lower().replace("_", "")
            return theme.color(name.replace("text", "tx").replace("background", "bg"))
    except (AttributeError, TypeError, ValueError):
        return None
    return None


def line_of(shape: Any, theme: Theme) -> dict[str, Any] | None:
    ln = shape.element.find(".//p:spPr/a:ln", NS)
    if ln is None or ln.find("a:noFill", NS) is not None:
        return None
    facts: dict[str, Any] = {}
    if ln.get("w"):
        facts["width_pt"] = round(Emu(int(ln.get("w"))).pt, 2)
    color = xml_color(ln.find("a:solidFill", NS), theme)
    if color:
        facts["color"] = color
    if ln.get("cap"):
        facts["cap"] = {"rnd": "round", "sq": "square", "flat": "butt"}.get(ln.get("cap"), ln.get("cap"))
    dash = ln.find("a:prstDash", NS)
    if dash is not None:
        facts["dash"] = dash.get("val")
    return facts or None


def radius_of(shape: Any) -> float | None:
    """Corner radius of a rounded rectangle, in px: its adjustment is a fraction of the shorter side."""
    try:
        if shape.shape_type != MSO_SHAPE_TYPE.AUTO_SHAPE or "ROUND" not in str(shape.auto_shape_type):
            return None
        adjustment = shape.adjustments[0] if len(shape.adjustments) else 0.16667
        return round(adjustment * min(px(shape.width), px(shape.height)), 2)
    except (ValueError, NotImplementedError, AttributeError):
        return None


def shape_facts(shape: Any, theme: Theme, inheritance: Inheritance) -> dict[str, Any]:
    facts: dict[str, Any] = {
        "kind": shape.shape_type.name.lower() if shape.shape_type is not None else "unknown",
        "name": shape.name,
        "x": px(shape.left),
        "y": px(shape.top),
        "width": px(shape.width),
        "height": px(shape.height),
    }
    if shape.is_placeholder:
        fmt = shape.placeholder_format
        facts["placeholder"] = fmt.type.name.lower() if fmt.type is not None else str(fmt.idx)
    fill = fill_of(shape, theme)
    if fill:
        facts["fill"] = fill
    line = line_of(shape, theme)
    if line:
        facts["line"] = line
    radius = radius_of(shape)
    if radius is not None:
        facts["radius_px"] = radius
    if shape.shape_type == MSO_SHAPE_TYPE.PICTURE:
        facts["image"] = {"type": shape.image.content_type, "pixels": list(shape.image.size)}
    if shape.has_text_frame:
        runs = []
        for paragraph in shape.text_frame.paragraphs:
            for run in paragraph.runs:
                if run.text.strip():
                    runs.append({"text": run.text, **inheritance.resolve(shape, paragraph, run)})
        if runs:
            facts["text"] = runs
    if shape.shape_type == MSO_SHAPE_TYPE.GROUP:
        facts["shapes"] = [shape_facts(child, theme, inheritance) for child in shape.shapes]
    return facts


def walk(shapes: list[dict[str, Any]]):
    for shape in shapes:
        yield shape
        yield from walk(shape.get("shapes", []))


HEX = re.compile(r"#[0-9a-fA-F]{6}\b")


def build_index(slides: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Every color and font, with the slides it appears on, so a token can be traced to its source.
    Hex values written in text are indexed separately as labels, and a swatch whose label names a
    different color than the one it is drawn in is reported as a conflict: the deck contradicts itself.
    """
    colors: dict[str, set[int]] = defaultdict(set)
    labels: dict[str, set[int]] = defaultdict(set)
    fonts: dict[str, set[int]] = defaultdict(set)
    conflicts = []
    for slide in slides:
        for text in [slide.get("notes") or ""]:
            for label in HEX.findall(text):
                labels[label.upper()].add(slide["number"])
        for shape in walk(slide["shapes"]):
            # A label can be split across runs ("#" in one, "d53bb6" in the next), so match the joined text
            joined = "".join(run["text"] for run in shape.get("text", []))
            written = sorted({h.upper() for h in HEX.findall(joined)})
            for label in written:
                labels[label].add(slide["number"])
            if shape.get("fill") and len(written) == 1 and written[0] != shape["fill"]:
                conflicts.append({"slide": slide["number"], "label": written[0], "drawn": shape["fill"], "shape": shape["name"]})
            for color in (shape.get("fill"), (shape.get("line") or {}).get("color")):
                if color:
                    colors[color].add(slide["number"])
            for run in shape.get("text", []):
                if run.get("color"):
                    colors[run["color"]].add(slide["number"])
                if run.get("font"):
                    key = f'{run["font"]} {run.get("size_pt", "?")}pt{" bold" if run.get("bold") else ""}'
                    fonts[key].add(slide["number"])
    return {
        "colors": {c: sorted(s) for c, s in sorted(colors.items())},
        "labels": {c: sorted(s) for c, s in sorted(labels.items())},
        "label_conflicts": conflicts,
        "fonts": {f: sorted(s) for f, s in sorted(fonts.items())},
    }


def extract(path: Path, only: set[int] | None) -> dict[str, Any]:
    deck = Presentation(str(path))
    theme = Theme(deck)
    inheritance = Inheritance(deck, theme)
    slides = []
    for number, slide in enumerate(deck.slides, start=1):
        if only and number not in only:
            continue
        # Decks exported from Google Slides often title slides with a subtitle placeholder
        heading = slide.shapes.title or next((s for s in slide.placeholders if s.has_text_frame and s.text_frame.text.strip()), None)
        title = heading.text_frame.text.strip() if heading is not None else None
        slides.append({
            "number": number,
            "layout": slide.slide_layout.name,
            "title": title,
            "shapes": [shape_facts(shape, theme, inheritance) for shape in slide.shapes],
            "notes": slide.notes_slide.notes_text_frame.text.strip() or None if slide.has_notes_slide else None,
        })
    return {
        "source": path.name,
        "slide": {"width_px": px(deck.slide_width), "height_px": px(deck.slide_height)},
        "theme": {"colors": theme.colors, "fonts": theme.fonts},
        "slides": slides,
        "index": build_index(slides),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("deck", type=Path, help="the .pptx brand deck")
    parser.add_argument("--slides", help="only these slides, e.g. 45,76 (numbered from 1)")
    parser.add_argument("--pretty", action="store_true", help="indent the JSON")
    args = parser.parse_args()
    if not args.deck.is_file():
        parser.error(f"no such file: {args.deck}")
    only = {int(n) for n in args.slides.split(",")} if args.slides else None
    json.dump(extract(args.deck, only), sys.stdout, indent=2 if args.pretty else None, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
