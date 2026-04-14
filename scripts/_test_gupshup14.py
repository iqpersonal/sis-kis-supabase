import requests
import json

api_key = "sk_90716b3967b5458487ba71ea8f8e8738"
app_id = "cee38c05-f353-4fe0-b02b-0dc5d8e61dc3"
source = "966531403994"
app_name = "kisapp"

# 1. Update callback URL to our webhook
print("=== 1. Update callback URL ===")
new_url = "https://sis-kis.web.app/api/whatsapp/webhook"
r = requests.post(
    f"https://api.gupshup.io/wa/app/{app_id}/callback",
    headers={"apikey": api_key, "Content-Type": "application/x-www-form-urlencoded"},
    data={"url": new_url, "modes": "SENT,DELIVERED,READ,OTHERS,FAILED,MESSAGE,TEMPLATE,ACCOUNT,BILLING,ENQUEUED"},
)
print(f"  POST: {r.status_code} {r.text[:300]}")

r = requests.put(
    f"https://api.gupshup.io/wa/app/{app_id}/callback",
    headers={"apikey": api_key, "Content-Type": "application/x-www-form-urlencoded"},
    data={"url": new_url, "modes": "SENT,DELIVERED,READ,OTHERS,FAILED,MESSAGE,TEMPLATE,ACCOUNT,BILLING,ENQUEUED"},
)
print(f"  PUT: {r.status_code} {r.text[:300]}")

# 2. Verify the callback was updated
print("\n=== 2. Verify callback ===")
r = requests.get(
    f"https://api.gupshup.io/wa/app/{app_id}/callback",
    headers={"apikey": api_key},
)
print(f"  {r.text[:500]}")

# 3. Try the wallet endpoint from Gupshup v2 docs
print("\n=== 3. Wallet ===")
for ep in [
    "https://api.gupshup.io/wa/account/wallet",
    f"https://api.gupshup.io/wa/app/{app_id}/wallet",
    "https://api.gupshup.io/wa/finance/account/balance",
]:
    r = requests.get(ep, headers={"apikey": api_key})
    if r.status_code == 200 and "error" not in r.text.lower()[:50]:
        print(f"  FOUND: {ep} -> {r.text[:300]}")
    else:
        print(f"  {r.status_code}: {ep}")

# 4. Send a template and immediately check for webhook delivery event
print("\n=== 4. Send template after callback update ===")
dest = "966569670909"
template = json.dumps({"id": "contact_update_request_1", "params": ["callback-test-token"]})
r = requests.post(
    "https://api.gupshup.io/wa/api/v1/template/msg",
    headers={"apikey": api_key, "Content-Type": "application/x-www-form-urlencoded"},
    data={"source": source, "destination": dest, "template": template, "src.name": app_name},
)
print(f"  Status: {r.status_code}, Response: {r.text[:300]}")
