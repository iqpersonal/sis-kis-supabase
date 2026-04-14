import requests
import json

api_key = "sk_90716b3967b5458487ba71ea8f8e8738"
source = "966531403994"
app_name = "kisapp"
dest = "966569670909"

# Test 1: TWO params (what the dashboard is sending) - likely fails silently
print("=== Test 1: TWO params (family_number + token) ===")
template = json.dumps({
    "id": "contact_update_request_1",
    "params": ["0021-3632", "test-token-two-params"]
})
r = requests.post(
    "https://api.gupshup.io/wa/api/v1/template/msg",
    headers={"apikey": api_key, "Content-Type": "application/x-www-form-urlencoded"},
    data={"source": source, "destination": dest, "template": template, "src.name": app_name},
)
print(f"  Status: {r.status_code}, Response: {r.text[:300]}")

# Test 2: ONE param (just the token) - should work
print("\n=== Test 2: ONE param (token only) ===")
template2 = json.dumps({
    "id": "contact_update_request_1",
    "params": ["test-token-one-param"]
})
r = requests.post(
    "https://api.gupshup.io/wa/api/v1/template/msg",
    headers={"apikey": api_key, "Content-Type": "application/x-www-form-urlencoded"},
    data={"source": source, "destination": dest, "template": template2, "src.name": app_name},
)
print(f"  Status: {r.status_code}, Response: {r.text[:300]}")
