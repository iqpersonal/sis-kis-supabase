import requests
import json

api_key = "sk_90716b3967b5458487ba71ea8f8e8738"
app_id = "cee38c05-f353-4fe0-b02b-0dc5d8e61dc3"
source = "966531403994"
app_name = "kisapp"

# 1. Check callback URL settings
print("=== 1. App callback settings ===")
r = requests.get(
    f"https://api.gupshup.io/wa/app/{app_id}",
    headers={"apikey": api_key},
)
app_data = r.json().get("app", {})
# Print everything to find callback URL
for k, v in app_data.items():
    print(f"  {k}: {v}")

# 2. Check partner info
print("\n=== 2. Partner info ===")
r = requests.get(
    f"https://api.gupshup.io/wa/app/{app_id}/partner",
    headers={"apikey": api_key},
)
print(f"  Status: {r.status_code}, Response: {r.text[:500]}")

# 3. Check phone number quality rating via Meta
print("\n=== 3. Check phone display name / quality ===")
r = requests.get(
    f"https://api.gupshup.io/wa/app/{app_id}/phone",
    headers={"apikey": api_key},
)
print(f"  Status: {r.status_code}, Response: {r.text[:500]}")

# 4. Try a completely simple template with NO parameters
print("\n=== 4. Send eduflagmin (no params, simple) ===")
dest = "966569670909"
template = json.dumps({"id": "eduflagmin", "params": []})
r = requests.post(
    "https://api.gupshup.io/wa/api/v1/template/msg",
    headers={"apikey": api_key, "Content-Type": "application/x-www-form-urlencoded"},
    data={"source": source, "destination": dest, "template": template, "src.name": app_name},
)
print(f"  Status: {r.status_code}, Response: {r.text[:300]}")

# 5. Try checking message status for recent message IDs
print("\n=== 5. Check message statuses ===")
msg_ids = [
    "d81a7a5e-4145-44d7-8c8a-db0a6a5c9671",  # first successful test6
    "3c82cc03-cf8b-45f2-9e97-85f167d0d2a3",  # test8 contact_update_request_1
    "f9b19552-8776-4c6c-ad5b-ae2078275f47",  # latest test11
]
for mid in msg_ids:
    for ep in [
        f"https://api.gupshup.io/wa/msg/{mid}",
        f"https://api.gupshup.io/wa/api/v1/msg/{mid}",
    ]:
        r = requests.get(ep, headers={"apikey": api_key})
        if r.status_code == 200 and "error" not in r.text.lower()[:50]:
            print(f"  {mid}: {r.text[:200]}")
            break
    else:
        print(f"  {mid}: no status available")

# 6. Check if maybe newBillingEnabled affects things - check billing
print("\n=== 6. Billing / subscription ===")
for ep in [
    f"https://api.gupshup.io/wa/app/{app_id}/subscription",
    f"https://api.gupshup.io/wa/app/{app_id}/billing",
]:
    r = requests.get(ep, headers={"apikey": api_key})
    print(f"  {ep.split('/')[-1]}: {r.status_code} {r.text[:200]}")
