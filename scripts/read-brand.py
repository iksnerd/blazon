#!/usr/bin/env python3
"""Read a blazon brand.json and print a summary of the brand.

brand.json is the whole brand in one file, written by `blazon build` next to the site (and served by the dev
server at /brand.json). This script uses nothing but Python's standard library, as proof that the file can be
read from outside blazon, and as the starting point for a tool that draws a deck from it.

    python3 scripts/read-brand.py dist/site/brand.json
    python3 scripts/read-brand.py http://localhost:3000/brand.json

The contract (RFC 0001 section 12): `format` is "blazon-brand" and `version` is an integer that changes only
when a field is removed or changes meaning, so a reader checks both and ignores keys it does not know. Every
`file` and `dir` in the file is a path beside brand.json; `sourceFile` on a token or page names the project
file it was authored in, which is not shipped. A length a brand states in units of its logo is
`{"units": n}`: multiply by the asset's `meta.unit` to get pixels in the artwork's own size.

Exit status: 0 on success, 2 when the file is not a blazon brand or has a version this reader does not know.
"""
import json
import sys
import urllib.request

FORMAT = "blazon-brand"
VERSION = 1
REM_PX = 16


class NotABrand(Exception):
    """The file is not something this reader can use; the message says why."""


def load(source):
    """Load brand.json from a path or an http(s) URL, and check its format and version."""
    if source.startswith(("http://", "https://")):
        with urllib.request.urlopen(source) as response:
            brand = json.load(response)
    else:
        with open(source, encoding="utf-8") as handle:
            brand = json.load(handle)
    return check(brand, source)


def check(brand, source):
    """The brand when it is a blazon brand of a version this reader understands; NotABrand otherwise. `source` only names it in the message."""
    if not isinstance(brand, dict) or brand.get("format") != FORMAT:
        raise NotABrand(f"{source} is not a blazon brand: its format is {brand.get('format') if isinstance(brand, dict) else None!r}, not {FORMAT!r}")
    if brand.get("version") != VERSION:
        raise NotABrand(f"{source} is version {brand.get('version')}; this reader understands version {VERSION}")
    return brand


def dimension_px(dimension):
    """A dimension {"value": 20, "unit": "px"} in pixels. A rem is read as 16px."""
    return dimension["value"] * (REM_PX if dimension["unit"] == "rem" else 1)


def measure_px(measure, meta):
    """A measure in the artwork's own pixels: a dimension, or {"units": n} of the asset's unit. None if unknown."""
    if "units" in measure:
        return measure["units"] * dimension_px(meta["unit"]) if "unit" in meta else None
    return dimension_px(measure)


def number(value):
    return int(value) if float(value).is_integer() else round(value, 2)


def logo_rules(asset):
    """One line of what a logo's sidecar states, or None when it states nothing about it."""
    meta = asset.get("meta") or {}
    parts = []
    if "lockup" in meta:
        parts.append(meta["lockup"])
    if "clearSpace" in meta:
        px = measure_px(meta["clearSpace"], meta)
        parts.append(f"clear space {number(px)}px" if px is not None else "clear space (no unit)")
    min_size = meta.get("minSize") or {}
    for side, label in (("width", "min width"), ("height", "min height")):
        if side in min_size:
            parts.append(f"{label} {number(dimension_px(min_size[side]))}px")
    if "placement" in meta:
        parts.append("placement " + ", ".join(meta["placement"]))
    return "  ".join(parts) if parts else None


def summary(brand):
    """The lines of the summary."""
    lines = [f"{brand['brand']['title']} ({brand['format']} v{brand['version']})"]
    tokens = brand["tokens"]
    lines.append(f"Tokens: {len(tokens)}")

    colors = [t for t in tokens if t.get("type") == "color"]
    lines.append(f"Colors: {len(colors)}")
    for token in colors:
        rules = (token.get("blazon") or {}).get("print") or {}
        extra = []
        if "cmyk" in rules:
            extra.append("CMYK " + " ".join(str(n) for n in rules["cmyk"]))
        if "pms" in rules:
            extra.append("PMS " + rules["pms"])
        if "ral" in rules:
            extra.append("RAL " + rules["ral"])
        lines.append(f"  {token['path']:<32} {token['value']}" + ("  " + "  ".join(extra) if extra else ""))

    fonts = [t for t in tokens if t.get("type") == "fontFamily"]
    if fonts:
        lines.append("Font families:")
        lines.extend(f"  {t['path']:<32} {t['value']}" for t in fonts)

    logos = [(asset, logo_rules(asset)) for asset in brand["assets"] if asset["category"] == "logos"]
    logos = [(asset, rules) for asset, rules in logos if rules]
    if logos:
        lines.append("Logo rules:")
        lines.extend(f"  {asset['id']:<32} {rules}" for asset, rules in logos)

    lines.append("Asset categories: " + (", ".join(c["label"] for c in brand["categories"]) or "none"))
    pages = brand["pages"]
    lines.append(f"Pages: {len(pages)}")
    for page in pages:
        names = sorted({d["name"] for d in page["directives"]})
        lines.append(f"  {page['title']:<28} {page['sourceFile']}" + (f"  [{', '.join(names)}]" if names else ""))

    counts = {severity: sum(1 for f in brand["findings"] if f["severity"] == severity) for severity in ("error", "warning", "info")}
    lines.append(f"Findings: {counts['error']} error(s), {counts['warning']} warning(s), {counts['info']} note(s)")
    return lines


def main(argv):
    if len(argv) != 2:
        print(__doc__.split("\n\n")[0] + "\n\nusage: read-brand.py <brand.json path or URL>", file=sys.stderr)
        return 2
    try:
        brand = load(argv[1])
    except NotABrand as error:
        print(error, file=sys.stderr)
        return 2
    print("\n".join(summary(brand)))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
