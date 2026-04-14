import requests
import json

api_key = "sk_90716b3967b5458487ba71ea8f8e8738"
app_id = "cee38c05-f353-4fe0-b02b-0dc5d8e61dc3"
source = "966531403994"
app_name = "kisapp"
dest = "966569670909"

# 1. Check message logs
print("=== 1. Message logs ===")
for endpoint in [
    f"https://api.gupshup.io/wa/app/{app_id}/msg/logs",
    f"https://api.gupshup.io/wa/msg/logs/{app_id}",
    f"https://api.gupshup.io/wa/app/{app_id}/logs",
]:
    r = requests.get(endpoint, headers={"apikey": api_key})
    if r.status_code == 200:
        print(f"  Endpoint: {endpoint}")
        print(f"  Response: {r.text[:500]}")
        break
    else:
        print(f"  {endpoint}: {r.status_code}")

# 2. Check health / opt-in status of the number
print("\n=== 2. Check number opt-in ===")
r = requests.get(
    f"https://api.gupshup.io/wa/app/{app_id}/userExist/{dest}",
    headers={"apikey": api_key},
)
print(f"  Status: {r.status_code}, Response: {r.text[:300]}")

# 3. Try sending a simple TEXT message in the session window
print("\n=== 3. Send text message ===")
msg = json.dumps({"type": "text", "text": "Test from KIS"})
r = requests.post(
    "https://api.gupshup.io/wa/api/v1/msg",
    headers={"apikey": api_key, "Content-Type": "application/x-www-form-urlencoded"},
    data={"channel": "whatsapp", "source": source, "destination": dest, "message": msg, "src.name": app_name},
)
print(f"  Status: {r.status_code}, Response: {r.text[:300]}")

# 4. Try template with destination in +966 format
print("\n=== 4. Template with + prefix ===")
template = json.dumps({"id": "contact_update_request_1", "params": ["test-plus-prefix"]})
r = requests.post(
    "https://api.gupshup.io/wa/api/v1/template/msg",
    headers={"apikey": api_key, "Content-Type": "application/x-www-form-urlencoded"},
    data={"source": source, "destination": f"+{dest}", "template": template, "src.name": app_name},
)
print(f"  Status: {r.status_code}, Response: {r.text[:300]}")

# 5. Try a known working template (e.g. feesreminder28090025 which is simple text, no buttons)
print("\n=== 5. Simple text-only template ===")
template2 = json.dumps({"id": "feesreminder28090025", "params": []})
r = requests.post(
    "https://api.gupshup.io/wa/api/v1/template/msg",
    headers={"apikey": api_key, "Content-Type": "application/x-www-form-urlencoded"},
    data={"source": source, "destination": dest, "template": template2, "src.name": app_name},
)
print(f"  Status: {r.status_code}, Response: {r.text[:300]}")

# 6. Check wallet balance
print("\n=== 6. Wallet balance ===")
for endpoint in [
    "https://api.gupshup.io/wa/account/wallet/balance",
    f"https://api.gupshup.io/wa/app/{app_id}/wallet/balance",
]:
    r = requests.get(endpoint, headers={"apikey": api_key})
    print(f"  {endpoint}: {r.status_code} {r.text[:200]}")

# 7. Get app health
print("\n=== 7. App health / quality ===")
r = requests.get(
    f"https://api.gupshup.io/wa/app/{app_id}/health",
    headers={"apikey": api_key},
)
print(f"  Status: {r.status_code}, Response: {r.text[:300]}")
