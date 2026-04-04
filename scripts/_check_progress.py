import json

p = json.load(open(r'.mirror_progress.json', 'r', encoding='utf-8'))
print(f"Completed: {len(p.get('completed', {}))}")
print(f"Failed: {len(p.get('failed', {}))}")
print(f"Skipped: {len(p.get('skipped', {}))}")
print()
print("--- SKIPPED (need re-upload) ---")
for k, v in p.get('skipped', {}).items():
    print(f"  {k}: {v['rows']:,} rows  |  error: {v.get('error','')[:80]}")
print()
print("--- FAILED ---")
for k, v in p.get('failed', {}).items():
    print(f"  {k}: {v}")
