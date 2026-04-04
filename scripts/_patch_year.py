"""Patch: add --year argument to live_sync_to_firestore.py"""
import os

f = os.path.join(os.path.dirname(__file__), "live_sync_to_firestore.py")
with open(f, "r", encoding="utf-8") as fh:
    content = fh.read()

# 1. Add --year argument to argparse
old_argparse = '''    parser.add_argument(
        "--mode",
        choices=["quick", "full"],
        default="quick",
        help="quick: current year + fees for prev year (fast). full: all years (slow, for recovery).",
    )
    args = parser.parse_args()'''

new_argparse = '''    parser.add_argument(
        "--mode",
        choices=["quick", "full"],
        default="quick",
        help="quick: current year + fees for prev year (fast). full: all years (slow, for recovery).",
    )
    parser.add_argument(
        "--year",
        help="Sync only this academic year (e.g. 25-26). Overrides --mode for year-based tables.",
    )
    args = parser.parse_args()'''

if old_argparse in content:
    content = content.replace(old_argparse, new_argparse)
    print("1. Added --year argument")
else:
    print("1. SKIP: --year argument block not found")

# 2. Update the log header to show year if provided
old_header = '    log.info("Live SQL -> Firestore Sync  [mode=%s]", args.mode)'
new_header = '''    if args.year:
        log.info("Live SQL -> Firestore Sync  [year=%s]", args.year)
    else:
        log.info("Live SQL -> Firestore Sync  [mode=%s]", args.mode)'''

if old_header in content:
    content = content.replace(old_header, new_header)
    print("2. Updated log header")
else:
    print("2. SKIP: log header not found")

# 3. Override years_filter when --year is provided
old_years_filter = '''        years_filter = get_years_for_table(sql_t, args.mode, current_year, prev_year)'''
new_years_filter = '''        if args.year:
            years_filter = [args.year]
        else:
            years_filter = get_years_for_table(sql_t, args.mode, current_year, prev_year)'''

if old_years_filter in content:
    content = content.replace(old_years_filter, new_years_filter)
    print("3. Added --year override for years_filter")
else:
    print("3. SKIP: years_filter line not found")

with open(f, "w", encoding="utf-8") as fh:
    fh.write(content)

print("Done!")
