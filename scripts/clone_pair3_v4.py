#!/usr/bin/env python3
"""
V4 Clone Script for Pair 3 (3.dxf)
- Clone T4/T5/T6 wire elements to T7/T8/T9 positions (dy = -1.25)
- NEW: Clone "PLC21 (FUTURE)" text (handle 998B)
- NEW: After clone, shift cable tag group right by dx = +1.0 to avoid overlap
"""
import os
import re
import json

workspace = '/home/hongbin/.hermes/kanban/workspaces/testfiles_2026.05.07/'
input_path = workspace + '3.dxf'
output_path = workspace + '3_cloned_v4.dxf'

with open(input_path, 'rb') as f:
    data = f.read()

# Split by CRLF (original DXF uses CRLF)
lines = data.split(b'\r\n')

# Decode for searching
text_lines = [l.decode('latin-1', errors='replace') for l in lines]

# Identify ENTITIES section boundaries
try:
    ss = text_lines.index('ENTITIES')
    ee = text_lines.index('ENDSEC', ss)
except ValueError:
    print("ERROR: Could not find ENTITIES or ENDSEC")
    exit(1)

print(f"ENTITIES starts at line {ss}, ENDSEC at line {ee}")

# V4 handles to clone = V3 list + 998B (PLC21 FUTURE)
clone_handles_hex = [
    "9847", "9646", "9853", "9644", "9648", "9647", "9643", "964D",
    "9A78", "9974", "9975", "9A77", "9846", "9978", "997B", "9970",
    "963B", "9852", "9639", "9972", "963D", "997A", "9979", "9867",
    "998A", "963C", "9971", "9638", "9868", "9885", "9886", "9866",
    "9A81", "9A80", "97A4", "9A79", "9877", "9983", "9A76",
    "998B",  # NEW: PLC21 (FUTURE)
]

SAFE_BASE = 0x9800  # Well below original max 0x9B3D (39741)

# Find maximum existing handle in the entire file
all_handles = []
for i, line in enumerate(text_lines):
    if line == '  5':
        try:
            h = int(text_lines[i+1].strip(), 16)
            all_handles.append(h)
        except:
            pass

max_existing = max(all_handles) if all_handles else 0
print(f"Max existing handle: 0x{max_existing:04X} ({max_existing})")
print(f"SAFE_BASE: 0x{SAFE_BASE:04X} ({SAFE_BASE})")

# Generate new handles for V4
counter = SAFE_BASE
handle_map = {}
for h in clone_handles_hex:
    while counter in all_handles:
        counter += 1
    handle_map[h] = counter
    all_handles.append(counter)
    counter += 1

print(f"\nV4 handle map ({len(handle_map)} clones):")
for src, dst in handle_map.items():
    print(f"  {src} -> 0x{dst:04X} ({dst})")

# Save V4 handle map
with open('/tmp/v4_handle_map.json', 'w') as f:
    json.dump(handle_map, f, indent=2)

# Find all entities to clone
entities = {}
for h in clone_handles_hex:
    pattern = re.compile(rf'^\s*{h}\s*$')
    for i in range(ss, ee):
        if pattern.match(text_lines[i]):
            # Found handle line, backtrack to entity start
            start = i
            while start > ss and text_lines[start] != '  0':
                start -= 1
            # Forward to next entity start or ENDSEC
            end = i + 1
            while end < ee and text_lines[end] != '  0':
                end += 1
            entities[h] = (start, end)
            break

print(f"\nFound {len(entities)} entities to clone")

# Prepare clones with proper handle substitution using WHILE loop
clones = []
for h in clone_handles_hex:
    if h not in entities:
        print(f"  WARNING: Handle {h} not found!")
        continue
    start, end = entities[h]
    new_handle = f"{handle_map[h]:04X}"

    clone_lines = []
    i = start
    while i < end:
        line = text_lines[i]

        # Replace handle
        if line == '  5':
            clone_lines.append(line)
            clone_lines.append(new_handle)
            i += 2  # Skip old handle value
            continue

        # Replace owner handle
        if line == '330':
            clone_lines.append(line)
            clone_lines.append('2')  # Modelspace owner
            i += 2  # Skip old owner handle value
            continue

        # Skip 360 (reactor handles) and other hard-pointer refs
        if line in ('360', '102'):
            clone_lines.append(line)
            i += 1
            if i < end:
                clone_lines.append(text_lines[i])
                i += 1
            continue

        clone_lines.append(line)
        i += 1

    clones.append(clone_lines)

print(f"Prepared {len(clones)} clones")

# Insert clones before ENDSEC (at ee-1 to keep ENDSEC last)
insert_pos = ee - 1
for clone_lines in clones:
    for line in reversed(clone_lines):
        lines.insert(insert_pos, line.encode('latin-1'))

print(f"Inserted {len(clones)} clones at position {insert_pos}")

# Rebuild text_lines after insertion
text_lines = [l.decode('latin-1', errors='replace') for l in lines]

# Apply X-shift to cable tag group clones
# These are the cloned handles of: 9A81, 9971, 998A, 9A80
CABLE_TAG_SOURCES = ["9A81", "9971", "998A", "9A80"]
cable_clone_handles = {f"{handle_map[h]:04X}" for h in CABLE_TAG_SOURCES if h in handle_map}
print(f"\nCable tag cloned handles to shift: {cable_clone_handles}")

DX_SHIFT = 1.0  # Shift right by 1.0 unit
SHIFTED_COUNT = 0

for i, line in enumerate(text_lines):
    # Check if this line is a handle for one of our cable tag clones
    if line == '  5' and i+1 < len(text_lines):
        h = text_lines[i+1].strip()
        if h in cable_clone_handles:
            # Found a cable tag clone entity. Now scan ahead for X coordinates
            j = i + 2
            entity_end = j
            # Find entity boundary
            while entity_end < len(text_lines) and text_lines[entity_end] != '  0':
                entity_end += 1

            # Modify X coordinates within this entity
            while j < entity_end:
                if text_lines[j] in (' 10', ' 11', ' 12', ' 13'):
                    # X coordinate follows
                    if j+1 < entity_end:
                        try:
                            old_x = float(text_lines[j+1])
                            new_x = old_x + DX_SHIFT
                            text_lines[j+1] = f"{new_x:.10g}"
                            SHIFTED_COUNT += 1
                        except:
                            pass
                j += 1

print(f"Applied dx={DX_SHIFT} to {SHIFTED_COUNT} X coordinates in {len(cable_clone_handles)} cable tag clone entities")

# Also replace CA-1451 -> CA-1452 in the cable tag clone
for i, line in enumerate(text_lines):
    if line.strip() == 'CA-1451':
        # Check if this is in our cable tag clone (handle 9820)
        # Backtrack to find handle
        j = i
        while j > 0 and text_lines[j] != '  5':
            j -= 1
        if j > 0 and j+1 < len(text_lines):
            h = text_lines[j+1].strip()
            if h in cable_clone_handles:
                text_lines[i] = 'CA-1452'
                print(f"Replaced cable tag text at line {i}: CA-1451 -> CA-1452 (handle {h})")

# Rebuild and enforce CRLF
output_lines = []
for line in text_lines:
    # Strip any existing line endings and add CRLF
    line = line.rstrip('\r\n')
    output_lines.append(line.encode('latin-1') + b'\r\n')

with open(output_path, 'wb') as f:
    f.writelines(output_lines)

# Verify
with open(output_path, 'rb') as f:
    check = f.read()

print(f"\n=== V4 Verification ===")
print(f"Output file: {output_path}")
print(f"Size: {len(check)} bytes")

# Check CRLF
crlf_count = check.count(b'\r\n')
lf_only = check.count(b'\n') - crlf_count
print(f"CRLF pairs: {crlf_count}")
print(f"LF-only: {lf_only}")

# Verify new handles exist
v4_text = check.decode('latin-1', errors='replace')
for src, dst in handle_map.items():
    h = f"{dst:04X}"
    if h not in v4_text:
        print(f"WARNING: Clone handle {h} not found in output!")

# Verify PLC21 (FUTURE) clone
plc_clone = f"{handle_map['998B']:04X}"
print(f"\nPLC21 (FUTURE) clone handle: {plc_clone}")
if plc_clone in v4_text:
    print("  Found in output")
else:
    print("  NOT FOUND")

# Verify shifted cable tag
for h in cable_clone_handles:
    # Find entity and show X
    idx = v4_text.index(f"\n  5\n{h}\n")
    if idx > 0:
        snippet = v4_text[idx:idx+200]
        for line in snippet.split('\n'):
            if line.startswith(' 10') or line.startswith(' 11'):
                print(f"  handle {h}: {line.strip()}")
                break

print("\nV4 script completed.")
