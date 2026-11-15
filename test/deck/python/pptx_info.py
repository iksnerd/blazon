"""Prints a .pptx file's slide count and slide size in EMU as JSON, with the standard library only (no python-pptx).

    python3 -I test/deck/python/pptx_info.py deck.pptx   ->   {"slides": 3, "size": "12192000x6858000"}
"""
import json
import re
import sys
import zipfile

with zipfile.ZipFile(sys.argv[1]) as deck:
    slides = [name for name in deck.namelist() if re.fullmatch(r"ppt/slides/slide\d+\.xml", name)]
    size = re.search(r'<p:sldSz cx="(\d+)" cy="(\d+)"', deck.read("ppt/presentation.xml").decode())
print(json.dumps({"slides": len(slides), "size": f"{size.group(1)}x{size.group(2)}" if size else None}))
