import requests

api_key = "sk_90716b3967b5458487ba71ea8f8e8738"

# Gupshup partner API to list apps
endpoints = [
    "https://api.gupshup.io/wa/api/v1/users/app",
    "https://partner.gupshup.io/wa/api/v1/partner/app",
    "https://api.gupshup.io/wa/api/v1/app/list",
    "https://api.gupshup.io/wa/api/v1/app",
]

for url in endpoints:
    print(f"\n=== GET {url} ===")
    r = requests.get(url, headers={"apikey": api_key})
    print(f"Status: {r.status_code}")
    text = r.text[:500] if len(r.text) > 500 else r.text
    print(f"Response: {text}")

# Try with Authorization header instead of apikey
print("\n\n=== Trying Authorization: Bearer header ===")
r = requests.post(
    "https://api.gupshup.io/wa/api/v1/template/msg",
    headers={
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/x-www-form-urlencoded",
    },
    data={
        "source": "966431403994",
        "destination": "966569670909",
        "template": '{"id": "contact_update_request", "params": ["0021-3632"]}',
        "src.name": "kisapp",
    },
)
print(f"Status: {r.status_code}, Response: {r.text}")

# Try with apiKey header (capital K)
print("\n=== Trying apiKey header (capital K) ===")
r = requests.post(
    "https://api.gupshup.io/wa/api/v1/template/msg",
    headers={
        "apiKey": api_key,
        "Content-Type": "application/x-www-form-urlencoded",
    },
    data={
        "source": "966431403994",
        "destination": "966569670909",
        "template": '{"id": "contact_update_request", "params": ["0021-3632"]}',
        "src.name": "kisapp",
    },
)
print(f"Status: {r.status_code}, Response: {r.text}")
