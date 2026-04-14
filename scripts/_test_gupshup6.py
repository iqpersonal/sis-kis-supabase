import requests
import json

api_key = "sk_90716b3967b5458487ba71ea8f8e8738"
# CORRECT phone from app details: 966531403994 (not 966431403994!)
source = "966531403994"
app_name = "kisapp"
dest = "966569670909"
template = json.dumps({"id": "contact_update_request", "params": ["0021-3632"]})

print(f"Source: {source}")
print(f"Destination: {dest}")

print("\n=== Test with CORRECT phone number ===")
r = requests.post(
    "https://api.gupshup.io/wa/api/v1/template/msg",
    headers={"apikey": api_key, "Content-Type": "application/x-www-form-urlencoded"},
    data={"source": source, "destination": dest, "template": template, "src.name": app_name},
)
print(f"  Status: {r.status_code}")
print(f"  Response: {r.text[:500]}")
