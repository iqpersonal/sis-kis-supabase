import requests
import json

api_key = "sk_90716b3967b5458487ba71ea8f8e8738"
source = "966531403994"
app_name = "kisapp"
dest = "966569670909"

# The template is "contact_update_request_1", language "en", has a URL button with {{1}}
# Try with correct template name
print("=== Test 1: correct template name contact_update_request_1 ===")
template = json.dumps({
    "id": "contact_update_request_1",
    "params": ["test-token-abc123"]
})
r = requests.post(
    "https://api.gupshup.io/wa/api/v1/template/msg",
    headers={"apikey": api_key, "Content-Type": "application/x-www-form-urlencoded"},
    data={"source": source, "destination": dest, "template": template, "src.name": app_name},
)
print(f"  Status: {r.status_code}, Response: {r.text[:500]}")

# Also try with the template_id instead of name
print("\n=== Test 2: using template UUID ===")
template2 = json.dumps({
    "id": "23cf7f12-d2b2-436b-854d-6ae47ec10a14",
    "params": ["test-token-abc123"]
})
r = requests.post(
    "https://api.gupshup.io/wa/api/v1/template/msg",
    headers={"apikey": api_key, "Content-Type": "application/x-www-form-urlencoded"},
    data={"source": source, "destination": dest, "template": template2, "src.name": app_name},
)
print(f"  Status: {r.status_code}, Response: {r.text[:500]}")
