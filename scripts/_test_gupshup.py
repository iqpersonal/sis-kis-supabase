import requests
import json

api_key = "sk_90716b3967b5458487ba71ea8f8e8738"
source = "966431403994"
app_name = "kisapp"
dest = "966569670909"

template = json.dumps({"id": "contact_update_request", "params": ["0021-3632"]})

data = {
    "source": source,
    "destination": dest,
    "template": template,
    "src.name": app_name,
}

print(f"Sending with source={source}, app_name={app_name}")
print(f"Template: {template}")
print()

r = requests.post(
    "https://api.gupshup.io/wa/api/v1/template/msg",
    headers={"apikey": api_key, "Content-Type": "application/x-www-form-urlencoded"},
    data=data,
)
print(f"Status: {r.status_code}")
print(f"Response: {r.text}")

# If failed, try with different source phone formats
if r.status_code != 200 or "error" in r.text.lower():
    print("\n--- Trying with +966 prefix ---")
    data["source"] = "+966431403994"
    r2 = requests.post(
        "https://api.gupshup.io/wa/api/v1/template/msg",
        headers={"apikey": api_key, "Content-Type": "application/x-www-form-urlencoded"},
        data=data,
    )
    print(f"Status: {r2.status_code}")
    print(f"Response: {r2.text}")

    print("\n--- Trying with 0 prefix (local) ---")
    data["source"] = "0431403994"
    r3 = requests.post(
        "https://api.gupshup.io/wa/api/v1/template/msg",
        headers={"apikey": api_key, "Content-Type": "application/x-www-form-urlencoded"},
        data=data,
    )
    print(f"Status: {r3.status_code}")
    print(f"Response: {r3.text}")

    print("\n--- Trying with App ID instead of app name ---")
    data["source"] = "966431403994"
    data["src.name"] = "cee38c05-f353-4fe0-b02b-0dc5d8e61dc3"
    r4 = requests.post(
        "https://api.gupshup.io/wa/api/v1/template/msg",
        headers={"apikey": api_key, "Content-Type": "application/x-www-form-urlencoded"},
        data=data,
    )
    print(f"Status: {r4.status_code}")
    print(f"Response: {r4.text}")
