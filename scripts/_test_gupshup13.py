import requests
import json

# The phone ID from Gupshup app details
phone_id = "1161441684682900"

# We need to check the Meta side. Let's try to get a System User Token
# from Meta's Graph API using the WABA ID
waba_id = "459821195694297"
business_id = "4598211956942971"

# First, let's check the Gupshup callback URL - it might reveal where messages go
api_key = "sk_90716b3967b5458487ba71ea8f8e8738"
app_id = "cee38c05-f353-4fe0-b02b-0dc5d8e61dc3"

print("=== 1. Get callback URL ===")
for ep in [
    f"https://api.gupshup.io/wa/app/{app_id}/settings",
    f"https://api.gupshup.io/wa/app/{app_id}/callback",
    f"https://api.gupshup.io/wa/app/{app_id}/settings/callback",
]:
    r = requests.get(ep, headers={"apikey": api_key})
    print(f"  {ep.split(app_id+'/')[-1]}: {r.status_code} {r.text[:300]}")

# 2. Update callback URL to our webhook to get delivery status events
print("\n=== 2. Set callback URL ===")
callback_url = "https://sis-kis.web.app/api/whatsapp/webhook"
for ep in [
    f"https://api.gupshup.io/wa/app/{app_id}/settings/callback",
]:
    r = requests.put(
        ep,
        headers={"apikey": api_key, "Content-Type": "application/json"},
        json={"callbackUrl": callback_url},
    )
    print(f"  PUT {ep.split(app_id+'/')[-1]}: {r.status_code} {r.text[:300]}")
    
    r = requests.post(
        ep,
        headers={"apikey": api_key, "Content-Type": "application/json"},
        json={"callbackUrl": callback_url},
    )
    print(f"  POST {ep.split(app_id+'/')[-1]}: {r.status_code} {r.text[:300]}")

# 3. Try the Gupshup update settings endpoint
print("\n=== 3. Update app settings ===")
r = requests.put(
    f"https://api.gupshup.io/wa/app/{app_id}",
    headers={"apikey": api_key, "Content-Type": "application/json"},
    json={"callbackUrl": callback_url},
)
print(f"  Status: {r.status_code}, Response: {r.text[:300]}")

# 4. Try the /settings endpoint with form data  
print("\n=== 4. Settings with form data ===")
r = requests.post(
    f"https://api.gupshup.io/wa/app/{app_id}/settings",
    headers={"apikey": api_key, "Content-Type": "application/x-www-form-urlencoded"},
    data={"callbackUrl": callback_url},
)
print(f"  Status: {r.status_code}, Response: {r.text[:300]}")

# 5. Check Quickwork partner subscription details
print("\n=== 5. Full subscription details ===")
r = requests.get(
    f"https://api.gupshup.io/wa/app/{app_id}/subscription",
    headers={"apikey": api_key},
)
data = r.json()
print(f"  Full response: {json.dumps(data, indent=2)[:1000]}")
