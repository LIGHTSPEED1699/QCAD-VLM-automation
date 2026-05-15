#!/usr/bin/env python3
"""
Text-based DXF entity deleter.
Reads DXF as text, finds entities by handle in ENTITIES section, and removes them.
Preserves all original DXF structure (tables, objects, etc.) except the deleted entities.
"""
import re
import sys
import json

def delete_entities_by_handles(input_path, output_path, handles_to_delete):
    """
    Delete entities from DXF by handle match in the ENTITIES section.
    handles_to_delete: set of hex string handles (uppercase, e.g., '36D1')
    """
    with open(input_path, 'r') as f:
        lines = f.readlines()
    
    handles_set = set(h.upper() for h in handles_to_delete)
    
    # Find ENTITIES section boundaries
    entities_start = None
    entities_end = None
    for i, line in enumerate(lines):
        if line.strip() == 'ENTITIES' and i > 0 and lines[i-1].strip() == '2':
            # This marks the start of ENTITIES section name after group code 2
            # Actually the pattern is:
            #   0
            # SECTION
            #   2
            # ENTITIES
            pass
        
    # Better: find "  0\nSECTION\n  2\nENTITIES" and "  0\nENDSEC\n"
    entities_marker = "  0\nSECTION\n  2\nENTITIES\n"
    endsec_marker = "  0\nENDSEC\n"
    
    # Rebuild content as string for easier section extraction
    content = ''.join(lines)
    
    entities_idx = content.find("  0\nSECTION\n  2\nENTITIES")
    if entities_idx == -1:
        # Try without leading space
        entities_idx = content.find("0\nSECTION\n2\nENTITIES")
    if entities_idx == -1:
        print("ERROR: ENTITIES section not found!")
        sys.exit(1)
    
    # Find the ENDSEC that closes ENTITIES
    # Search for "  0\nENDSEC" after ENTITIES start
    endsec_idx = content.find("  0\nENDSEC", entities_idx + 20)
    if endsec_idx == -1:
        print("ERROR: ENDSEC for ENTITIES not found!")
        sys.exit(1)
    
    entities_section = content[entities_idx:endsec_idx + 10]  # include "  0\nENDSEC"
    
    # Parse entities within the section
    # Each entity starts with "  0\n<ENTITY_TYPE>\n"
    # The handle is after "  5\n<HANDLE>\n"
    
    # Split by entity starts
    entity_pattern = re.compile(r'\n  0\n([A-Z_]+)\n')
    
    # Find all entity starts within the entities section
    matches = list(entity_pattern.finditer(entities_section))
    
    deleted_count = 0
    kept_entities = []
    
    for i, match in enumerate(matches):
        entity_type = match.group(1)
        start_pos = match.start()  # includes the leading \n
        
        # Determine end position (start of next entity or ENDSEC)
        if i + 1 < len(matches):
            end_pos = matches[i + 1].start()
        else:
            # Last entity before ENDSEC
            end_pos = entities_section.find("\n  0\nENDSEC", start_pos)
            if end_pos == -1:
                end_pos = len(entities_section)
        
        entity_text = entities_section[start_pos:end_pos]
        
        # Extract handle from entity
        handle_match = re.search(r'\n  5\n([0-9A-Fa-f]+)\n', entity_text)
        if handle_match:
            handle = handle_match.group(1).upper()
            if handle in handles_set:
                deleted_count += 1
                continue  # skip this entity
        
        kept_entities.append(entity_text)
    
    # Rebuild entities section
    # Start with the SECTION header (everything from entities_idx to first entity)
    first_entity_start = matches[0].start() if matches else len(entities_section)
    header_part = entities_section[:first_entity_start]
    
    # End with ENDSEC
    endsec_part = entities_section[entities_section.find("\n  0\nENDSEC"):]
    
    new_entities_section = header_part + ''.join(kept_entities) + endsec_part
    
    # Rebuild full content
    new_content = content[:entities_idx] + new_entities_section + content[endsec_idx + 10:]
    
    with open(output_path, 'w') as f:
        f.write(new_content)
    
    print(f"Deleted {deleted_count} entities out of {len(matches)} total.")
    print(f"Output: {output_path}")
    return deleted_count

if __name__ == '__main__':
    if len(sys.argv) != 4:
        print(f"Usage: {sys.argv[0]} input.dxf output.dxf handles.json")
        sys.exit(1)
    
    with open(sys.argv[3], 'r') as f:
        handles = json.load(f)
    
    delete_entities_by_handles(sys.argv[1], sys.argv[2], handles)
