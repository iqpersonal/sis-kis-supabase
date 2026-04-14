import requests
import json

api_key = "sk_90716b3967b5458487ba71ea8f8e8738"
app_id = "cee38c05-f353-4fe0-b02b-0dc5d8e61dc3"
source = "966531403994"
app_name = "kisapp"
dest = "966569670909"

# 1. Get the partner token body
print("=== 1. Partner token response ===")
try:
    r = requests.get(
        f"https://partner.gupshup.io/wa/token/{app_id}",
        headers={"apikey": api_key},
        allow_redirects=True,
        timeout=10,
    )
    print(f"  Status: {r.status_code}")
    print(f"  Headers: {dict(r.headers)}")
    print(f"  Body: {r.text[:1000]}")
except Exception as e:
    print(f"  Error: {e}")

# 2. Per Gupshup docs, for URL button templates, try explicit format
# Some docs show params need to be in a "buttons" section
print("\n=== 2. Template with explicit button params ===")

# Format A: Flat params (what we've been doing)
template_a = json.dumps({
    "id": "contact_update_request_1",
    "params": ["test-flat-param"]
})

# Format B: Body + button params separated 
template_b = json.dumps({
    "id": "contact_update_request_1",
    "params": [],
    "buttons": [{"type": "url", "params": ["test-button-param"]}]
})

# Format C: No body params, button as named section
template_c = json.dumps({
    "id": "contact_update_request_1",
    "body_params": [],
    "url_button_params": ["test-url-param"]
})

# Format D: Message object format (some docs show this)
template_d = json.dumps({
    "id": "contact_update_request_1",
    "components": [
        {"type": "button", "sub_type": "url", "index": 0, "parameters": [{"type": "text", "text": "test-component-param"}]}
    ]
})

for label, tmpl in [("A: flat params", template_a), ("B: buttons section", template_b), 
                     ("C: named sections", template_c), ("D: components", template_d)]:
    r = requests.post(
        "https://api.gupshup.io/wa/api/v1/template/msg",
        headers={"apikey": api_key, "Content-Type": "application/x-www-form-urlencoded"},
        data={"source": source, "destination": dest, "template": tmpl, "src.name": app_name},
    )
    print(f"  {label}: {r.status_code} {r.text[:200]}")

# 3. Try using a DIFFERENT destination number to rule out rate limiting
print("\n=== 3. Try different destination (source itself) ===")
template = json.dumps({"id": "contact_update_request_1", "params": ["diff-dest-test"]})
# Try sending to the business number itself (won't deliver but reveals different errors)
r = requests.post(
    "https://api.gupshup.io/wa/api/v1/template/msg",
    headers={"apikey": api_key, "Content-Type": "application/x-www-form-urlencoded"},
    data={"source": source, "destination": source, "template": template, "src.name": app_name},
)
print(f"  To self: {r.status_code} {r.text[:200]}")

# 4. Check Gupshup message events via their event log API
print("\n=== 4. Event log ===")
for ep in [
    f"https://api.gupshup.io/wa/app/{app_id}/events",
    f"https://api.gupshup.io/wa/events/{app_id}",
    f"https://api.gupshup.io/wa/dashboard/events/{app_id}",
]:
    r = requests.get(ep, headers={"apikey": api_key})
    if r.status_code == 200 and "error" not in r.text.lower()[:50]:
        print(f"  FOUND: {ep} -> {r.text[:500]}")
        break
    else:
        print(f"  {r.status_code}: {ep}")
