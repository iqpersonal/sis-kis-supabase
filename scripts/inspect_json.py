"""Inspect the large extracted JSON to find table names and sample columns."""
import json
import sys

FILE = r"C:\temp\test_output.json"

# Use ijson for streaming if available, otherwise use a manual approach
# Read the first portion of the file to get table structure
with open(FILE, "r", encoding="utf-8", errors="replace") as f:
    # Read first 50 MB
    chunk = f.read(50 * 1024 * 1024)

# Try to find top-level keys by looking for pattern "tableName": [
import re

# Find all top-level keys  
keys = re.findall(r'^\s{2}"([^"]+)"\s*:\s*\[', chunk, re.MULTILINE)
print(f"Found {len(keys)} table keys in first 50MB:")
for k in keys:
    print(f"  - {k}")

# For each found key, try to get the first record's columns
for key in keys:
    pattern = rf'"{re.escape(key)}"\s*:\s*\[\s*\{{'
    match = re.search(pattern, chunk)
    if match:
        # Extract from the opening brace of first record
        start = match.end() - 1
        # Find the closing brace (simple, may fail on nested)
        depth = 0
        end = start
        for i in range(start, min(start + 5000, len(chunk))):
            if chunk[i] == '{':
                depth += 1
            elif chunk[i] == '}':
                depth -= 1
                if depth == 0:
                    end = i + 1
                    break
        if end > start:
            try:
                record = json.loads(chunk[start:end])
                cols = list(record.keys())
                print(f"\n  {key} columns: {cols}")
                # Print sample values (truncated)
                for c in cols[:12]:
                    val = record[c]
                    val_str = str(val)[:80]
                    print(f"    {c}: {val_str}")
            except json.JSONDecodeError:
                print(f"\n  {key}: could not parse first record")
