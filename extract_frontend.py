#!/usr/bin/env python3
"""
Parses index.html (Lovable source code export) and extracts every source file
to its proper path under frontend/.

The format is tricky: the last line of each file's content IS the header line
of the next file. We anchor on "N LINES · EXT" lines and look at the line
immediately before them to get the filename.
"""

import os
import re

INPUT_FILE = "/Users/kittypurrnaz/Documents/push-and-pray/index.html"
OUTPUT_DIR = "/Users/kittypurrnaz/Documents/push-and-pray/frontend"

LINES_RE = re.compile(r'^(\d+) LINES · [A-Z0-9a-z+]+$')

def parse_files(raw_lines):
    """
    Find all 'N LINES · EXT' anchor lines. For each anchor:
      - The line immediately before is the filename
      - The N lines after the anchor are the file content
      - The N-th line (last) of that content may itself be the filename
        of the next file (it will be caught when we process the next anchor)

    Returns list of (filepath, start_idx, end_idx) where content = raw_lines[start_idx:end_idx]
    """
    # Find all anchor line indices (1-indexed line → 0-indexed array)
    anchors = []  # (line_index_of_anchor, filename, num_lines)
    for idx, line in enumerate(raw_lines):
        m = LINES_RE.match(line.rstrip('\n'))
        if m:
            num_lines = int(m.group(1))
            if idx > 0:
                filename = raw_lines[idx - 1].rstrip('\n').strip()
                anchors.append((idx, filename, num_lines))

    files = []
    for anchor_idx, filename, num_lines in anchors:
        content_start = anchor_idx + 1
        # The content includes num_lines lines; but the LAST line is the next
        # file's header, so we only take num_lines - 1 lines as actual content
        # ... UNLESS it's the last file.
        # Actually: the format includes the filename of the next file as the
        # last line. We want content_start to content_start + num_lines - 1.
        # But we need to verify: the last line equals the next file's name.
        content_end = content_start + num_lines  # exclusive, num_lines lines total
        # Take all num_lines lines as content; the caller strips the last if needed
        content_lines = raw_lines[content_start:content_end]
        files.append((filename, content_lines, num_lines))

    return files, anchors

def main():
    with open(INPUT_FILE, 'r', encoding='utf-8') as f:
        raw_lines = f.readlines()

    print(f"Total lines in index.html: {len(raw_lines)}")

    files, anchors = parse_files(raw_lines)
    print(f"Detected {len(files)} anchor blocks\n")

    # Build a set of all filenames so we can detect the last-line overlap
    all_filenames = {fname for fname, _, _ in files}

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    extracted = []
    skipped   = []

    SKIP = {
        "Source Code Browser",
        "Read-only view of the exported frontend. Click any file in the sidebar to jump to it.",
        "MARKET RESEARCHER",
    }

    for filepath, content_lines, _ in files:
        if filepath in SKIP or not filepath:
            skipped.append(filepath)
            continue

        # The last line of content is the next file's header — strip it
        # but only if it matches a known filename
        if content_lines and content_lines[-1].rstrip('\n').strip() in all_filenames:
            content_lines = content_lines[:-1]

        # Remap root-level index.html so we don't overwrite the export source
        if filepath == "index.html":
            dest_path = os.path.join(OUTPUT_DIR, "index.html")
        else:
            dest_path = os.path.join(OUTPUT_DIR, filepath)

        # Create parent dirs
        parent = os.path.dirname(dest_path)
        if parent:
            os.makedirs(parent, exist_ok=True)

        with open(dest_path, 'w', encoding='utf-8') as f:
            f.writelines(content_lines)

        extracted.append(dest_path)

    print("=== Extracted files ===")
    for p in extracted:
        rel = os.path.relpath(p, OUTPUT_DIR)
        print(f"  {rel}")

    if skipped:
        print(f"\nSkipped {len(skipped)} non-file blocks")

    print(f"\nTotal extracted: {len(extracted)}")
    print(f"Output directory: {OUTPUT_DIR}")

if __name__ == "__main__":
    main()
