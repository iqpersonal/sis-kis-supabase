import requests
import json

api_key = "sk_90716b3967b5458487ba71ea8f8e8738"
app_id = "cee38c05-f353-4fe0-b02b-0dc5d8e61dc3"
msg_id = "d81a7a5e-4145-44d7-8c8a-db0a6a5c9671"

# Check template details
print("=== Template details ===")
r = requests.get(
    f"https://api.gupshup.io/wa/app/{app_id}/template",
    headers={"apikey": api_key},
)
templates = r.json().get("templates", [])
for t in templates:
    print(f"  Name: {t.get('elementName')}")
    print(f"  Status: {t.get('status')}")
    print(f"  Category: {t.get('category')}")
    print(f"  Language: {t.get('languageCode')}")
    meta = t.get('containerMeta', '{}')
    if isinstance(meta, str):
        try:
            meta = json.loads(meta)
        except:
            pass
    print(f"  Data: {json.dumps(meta.get('data', ''), ensure_ascii=False)[:200] if isinstance(meta, dict) else str(meta)[:200]}")
    print(f"  Buttons: {meta.get('buttons', '') if isinstance(meta, dict) else ''}")
    print(f"  Template ID: {t.get('id')}")
    print()

# Check message status
print("=== Message status ===")
r = requests.get(
    f"https://api.gupshup.io/wa/msg/{msg_id}/status",
    headers={"apikey": api_key},
)
print(f"  Status: {r.status_code}, Response: {r.text[:500]}")

# Try sending again with +966 prefix on destination
print("\n=== Resend with +966 destination ===")
template = json.dumps({"id": "contact_update_request", "params": ["0021-3632"]})
r = requests.post(
    "https://api.gupshup.io/wa/api/v1/template/msg",
    headers={"apikey": api_key, "Content-Type": "application/x-www-form-urlencoded"},
    data={"source": "966531403994", "destination": "966569670909", "template": template, "src.name": "kisapp"},
)
print(f"  Status: {r.status_code}, Response: {r.text[:500]}")

# Check wallet balance
print("\n=== Wallet ===")
r = requests.get(
    "https://api.gupshup.io/wa/account/wallet/balance",
    headers={"apikey": api_key},
)
print(f"  Status: {r.status_code}, Response: {r.text[:300]}")
