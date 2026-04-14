import requests
import json

api_key = "sk_90716b3967b5458487ba71ea8f8e8738"
app_id = "cee38c05-f353-4fe0-b02b-0dc5d8e61dc3"
source = "966531403994"
app_name = "kisapp"

# 1. Check with the correct msg logs endpoint
print("=== 1. Logs endpoint variations ===")
endpoints = [
    f"https://api.gupshup.io/wa/app/{app_id}/logs/outbound",
    f"https://api.gupshup.io/wa/app/{app_id}/logs?pageNo=1&pageSize=5",
    f"https://api.gupshup.io/wa/app/{app_id}/msg?pageNo=1&pageSize=5",
    f"https://api.gupshup.io/wa/msg/{app_id}?pageNo=1&pageSize=5",
    f"https://api.gupshup.io/wa/api/v1/msg/logs/{app_id}",
    f"https://api.gupshup.io/wa/api/logs/{app_id}", 
]
for ep in endpoints:
    try:
        r = requests.get(ep, headers={"apikey": api_key}, timeout=10)
        if r.status_code == 200 and "error" not in r.text.lower()[:50]:
            print(f"  FOUND: {ep}")
            print(f"  Response: {r.text[:500]}")
        else:
            print(f"  {r.status_code}: {ep} -> {r.text[:100]}")
    except Exception as e:
        print(f"  Error: {ep} -> {e}")

# 2. Try opt-in the destination number first. Gupshup requires explicit opt-in 
# for some accounts
print("\n=== 2. Opt-in the destination ===")
dest = "966569670909"
r = requests.post(
    f"https://api.gupshup.io/wa/app/{app_id}/optin",
    headers={"apikey": api_key, "Content-Type": "application/x-www-form-urlencoded"},
    data={"user": dest},
)
print(f"  Status: {r.status_code}, Response: {r.text[:300]}")

# 2b. Also try the /sm/ opt-in endpoint
print("\n=== 2b. Opt-in via sm endpoint ===")
r = requests.post(
    "https://api.gupshup.io/sm/api/v1/app/opt/in/kisapp",
    headers={"apikey": api_key, "Content-Type": "application/x-www-form-urlencoded"},
    data={"user": dest},
)
print(f"  Status: {r.status_code}, Response: {r.text[:300]}")

# 3. Now send template AFTER opt-in
print("\n=== 3. Send template AFTER opt-in ===")
template = json.dumps({"id": "contact_update_request_1", "params": ["after-optin-test"]})
r = requests.post(
    "https://api.gupshup.io/wa/api/v1/template/msg",
    headers={"apikey": api_key, "Content-Type": "application/x-www-form-urlencoded"},
    data={"source": source, "destination": dest, "template": template, "src.name": app_name},
)
print(f"  Status: {r.status_code}, Response: {r.text[:300]}")

# 4. Check if app settings show opt-in requirement
print("\n=== 4. App settings ===")
r = requests.get(
    f"https://api.gupshup.io/wa/app/{app_id}",
    headers={"apikey": api_key},
)
data = r.json()
app = data.get("app", {})
print(f"  Name: {app.get('name')}")
print(f"  Phone: {app.get('phone')}")
print(f"  Live: {app.get('live')}")
print(f"  Provider: {app.get('provider')}")
print(f"  Type: {app.get('type')}")
print(f"  disableOptinPrefUrl: {app.get('disableOptinPrefUrl')}")
print(f"  Template Messaging: {app.get('templateMessaging')}")
print(f"  Stopped: {app.get('stopped')}")
# Print all keys for reference
print(f"  All keys: {list(app.keys())}")
