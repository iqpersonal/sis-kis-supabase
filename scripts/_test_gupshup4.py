import requests
import json

api_key = "sk_90716b3967b5458487ba71ea8f8e8738"
source = "966431403994"
app_name = "kisapp"
app_id = "cee38c05-f353-4fe0-b02b-0dc5d8e61dc3"
dest = "966569670909"
template = json.dumps({"id": "contact_update_request", "params": ["0021-3632"]})

tests = [
    ("app_name + channel", {"source": source, "destination": dest, "template": template, "src.name": app_name, "channel": "whatsapp"}),
    ("app_id as src.name + channel", {"source": source, "destination": dest, "template": template, "src.name": app_id, "channel": "whatsapp"}),
    ("app_name NO channel", {"source": source, "destination": dest, "template": template, "src.name": app_name}),
    ("no src.name + channel", {"source": source, "destination": dest, "template": template, "channel": "whatsapp"}),
    ("app_id + no channel", {"source": source, "destination": dest, "template": template, "src.name": app_id}),
]

for label, data in tests:
    print(f"\n=== {label} ===")
    r = requests.post(
        "https://api.gupshup.io/wa/api/v1/template/msg",
        headers={"apikey": api_key, "Content-Type": "application/x-www-form-urlencoded"},
        data=data,
    )
    print(f"  Status: {r.status_code}, Response: {r.text[:200]}")
    if r.status_code == 202 or '"status":"success"' in r.text.lower():
        print("  >>> SUCCESS! <<<")
        break

# Also try the account-level endpoint
print("\n\n=== Account-level API key check ===")
r = requests.get(
    "https://api.gupshup.io/wa/account",
    headers={"apikey": api_key},
)
print(f"  Status: {r.status_code}, Response: {r.text[:300]}")

# Try querying templates to verify API key works
print("\n=== Get templates for app ===")
r = requests.get(
    f"https://api.gupshup.io/wa/app/{app_id}/template",
    headers={"apikey": api_key},
)
print(f"  Status: {r.status_code}, Response: {r.text[:500]}")

# Try with appname in URL
print("\n=== Get templates by app name ===")
r = requests.get(
    f"https://api.gupshup.io/wa/app/{app_name}/template",
    headers={"apikey": api_key},
)
print(f"  Status: {r.status_code}, Response: {r.text[:500]}")
