import requests
import json

# Gupshup app is on FBC (Facebook Cloud). We can try Meta's Cloud API directly.
# Phone ID from Gupshup: 1161441684682900
# WABA ID: 459821195694297

# First, check if we can get a token from Gupshup for the FBC phone
api_key = "sk_90716b3967b5458487ba71ea8f8e8738"
app_id = "cee38c05-f353-4fe0-b02b-0dc5d8e61dc3"

print("=== 1. Get access token from Gupshup ===")
for ep in [
    f"https://api.gupshup.io/wa/app/{app_id}/token",
    f"https://api.gupshup.io/wa/app/{app_id}/access-token",
    f"https://api.gupshup.io/wa/token/{app_id}",
]:
    r = requests.get(ep, headers={"apikey": api_key})
    print(f"  {ep.split(app_id+'/')[-1] if app_id in ep else ep.split('/')[-1]}: {r.status_code} {r.text[:300]}")

# 2. Try to get token via partner endpoint
print("\n=== 2. Partner access token ===")
r = requests.get(
    f"https://partner.gupshup.io/wa/token/{app_id}",
    headers={"apikey": api_key},
    allow_redirects=True,
    timeout=10,
)
print(f"  Status: {r.status_code}")

# 3. Check the template on Gupshup side for correctness
print("\n=== 3. Template container meta (full) ===")
r = requests.get(
    f"https://api.gupshup.io/wa/app/{app_id}/template",
    headers={"apikey": api_key},
)
templates = r.json().get("templates", [])
for t in templates:
    if t.get("elementName") == "contact_update_request_1":
        print(f"  Element Name: {t.get('elementName')}")
        print(f"  Status: {t.get('status')}")
        print(f"  Language: {t.get('languageCode')}")
        meta = t.get("containerMeta", "{}")
        if isinstance(meta, str):
            meta = json.loads(meta)
        print(f"  Data (body): {meta.get('data', '')}")
        print(f"  Buttons: {json.dumps(meta.get('buttons', []), indent=2)}")
        print(f"  Header: {meta.get('header', 'none')}")
        print(f"  Footer: {meta.get('footer', 'none')}")
        
        # Check the exact parameter structure expected
        # Buttons with URL type usually need params differently
        print(f"\n  Template ID: {t.get('id')}")
        print(f"  Vertical: {t.get('vertical', 'none')}")
        print(f"  Category: {t.get('category')}")
        print(f"  Allow template category change: {t.get('allowTemplateCategoryChange')}")
        print(f"  Full template object keys: {list(t.keys())}")
        break
