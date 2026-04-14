import requests
import json

api_key = "sk_90716b3967b5458487ba71ea8f8e8738"
source = "966431403994" 
app_name = "kisapp"
app_id = "cee38c05-f353-4fe0-b02b-0dc5d8e61dc3"
dest = "966569670909"
template = json.dumps({"id": "contact_update_request", "params": ["0021-3632"]})

# Test 1: Try partner endpoint
print("=== 1. partner.gupshup.io ===")
try:
    r = requests.post(
        "https://partner.gupshup.io/wa/api/v1/template/msg",
        headers={"apikey": api_key, "Content-Type": "application/x-www-form-urlencoded"},
        data={"source": source, "destination": dest, "template": template, "src.name": app_name},
        timeout=10
    )
    print(f"  Status: {r.status_code}, Response: {r.text[:300]}")
except Exception as e:
    print(f"  Error: {e}")

# Test 2: Try with Authorization header instead of apikey
print("\n=== 2. Authorization: Bearer ===")
r = requests.post(
    "https://api.gupshup.io/wa/api/v1/template/msg",
    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/x-www-form-urlencoded"},
    data={"source": source, "destination": dest, "template": template, "src.name": app_name},
)
print(f"  Status: {r.status_code}, Response: {r.text[:300]}")

# Test 3: Try with Authorization: apikey
print("\n=== 3. Authorization: apikey ===")
r = requests.post(
    "https://api.gupshup.io/wa/api/v1/template/msg",
    headers={"Authorization": api_key, "Content-Type": "application/x-www-form-urlencoded"},
    data={"source": source, "destination": dest, "template": template, "src.name": app_name},
)
print(f"  Status: {r.status_code}, Response: {r.text[:300]}")

# Test 4: Try the SM (single message) API
print("\n=== 4. SM API ===")
try:
    r = requests.post(
        "https://api.gupshup.io/sm/api/v1/template/msg",
        headers={"apikey": api_key, "Content-Type": "application/x-www-form-urlencoded"},
        data={"source": source, "destination": dest, "template": template, "src.name": app_name},
        timeout=10
    )
    print(f"  Status: {r.status_code}, Response: {r.text[:300]}")
except Exception as e:
    print(f"  Error: {e}")

# Test 5: Try with app_id in request body
print("\n=== 5. app_id in body ===")
r = requests.post(
    "https://api.gupshup.io/wa/api/v1/template/msg",
    headers={"apikey": api_key, "Content-Type": "application/x-www-form-urlencoded"},
    data={"source": source, "destination": dest, "template": template, "src.name": app_name, "appId": app_id},
)
print(f"  Status: {r.status_code}, Response: {r.text[:300]}")

# Test 6: Try with JSON body instead of form
print("\n=== 6. JSON body ===")
r = requests.post(
    "https://api.gupshup.io/wa/api/v1/template/msg",
    headers={"apikey": api_key, "Content-Type": "application/json"},
    json={"source": source, "destination": dest, "template": {"id": "contact_update_request", "params": ["0021-3632"]}, "src.name": app_name},
)
print(f"  Status: {r.status_code}, Response: {r.text[:300]}")

# Test 7: Try querying apps to see what we have access to
print("\n=== 7. List apps ===")
r = requests.get(
    "https://api.gupshup.io/wa/app/list",
    headers={"apikey": api_key},
)
print(f"  Status: {r.status_code}, Response: {r.text[:500]}")

# Test 8: Try getting app details 
print("\n=== 8. App details ===")
r = requests.get(
    f"https://api.gupshup.io/wa/app/{app_id}",
    headers={"apikey": api_key},
)
print(f"  Status: {r.status_code}, Response: {r.text[:500]}")
