import requests
import json

api_key = "sk_90716b3967b5458487ba71ea8f8e8738"
source = "966431403994"
app_name = "kisapp"
dest = "966569670909"

# Test 1: Try /sm/api endpoint (older Gupshup format)
print("=== Test 1: /sm/api/v1/template/msg ===")
r = requests.post(
    "https://api.gupshup.io/sm/api/v1/template/msg",
    headers={"apikey": api_key, "Content-Type": "application/x-www-form-urlencoded"},
    data={
        "source": source,
        "destination": dest,
        "template": json.dumps({"id": "contact_update_request", "params": ["0021-3632"]}),
        "src.name": app_name,
    },
)
print(f"Status: {r.status_code}, Response: {r.text}")

# Test 2: Try with channel=whatsapp
print("\n=== Test 2: with channel param ===")
r = requests.post(
    "https://api.gupshup.io/wa/api/v1/template/msg",
    headers={"apikey": api_key, "Content-Type": "application/x-www-form-urlencoded"},
    data={
        "channel": "whatsapp",
        "source": source,
        "destination": dest,
        "template": json.dumps({"id": "contact_update_request", "params": ["0021-3632"]}),
        "src.name": app_name,
    },
)
print(f"Status: {r.status_code}, Response: {r.text}")

# Test 3: Try simple text message instead of template
print("\n=== Test 3: Simple text message ===")
r = requests.post(
    "https://api.gupshup.io/wa/api/v1/msg",
    headers={"apikey": api_key, "Content-Type": "application/x-www-form-urlencoded"},
    data={
        "channel": "whatsapp",
        "source": source,
        "destination": dest,
        "message": json.dumps({"type": "text", "text": "Test message from KIS"}),
        "src.name": app_name,
    },
)
print(f"Status: {r.status_code}, Response: {r.text}")

# Test 4: Try checking app status
print("\n=== Test 4: Get app details ===")
r = requests.get(
    f"https://api.gupshup.io/wa/app/{app_name}",
    headers={"apikey": api_key},
)
print(f"Status: {r.status_code}, Response: {r.text[:500]}")

# Test 5: List apps
print("\n=== Test 5: List apps ===")
r = requests.get(
    "https://api.gupshup.io/wa/apps",
    headers={"apikey": api_key},
)
print(f"Status: {r.status_code}, Response: {r.text[:500]}")
