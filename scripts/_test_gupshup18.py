import requests
import json
import time

api_key = "sk_90716b3967b5458487ba71ea8f8e8738"
app_id = "cee38c05-f353-4fe0-b02b-0dc5d8e61dc3"
source = "966531403994"
app_name = "kisapp"
dest = "966569670909"

# First set callback to webhook.site for real-time feedback
print("=== Setting up webhook.site ===")
r = requests.post("https://webhook.site/token", timeout=10)
token_data = r.json()
webhook_uuid = token_data.get("uuid")
webhook_url = f"https://webhook.site/{webhook_uuid}"
print(f"  Webhook: {webhook_url}")

r = requests.put(
    f"https://api.gupshup.io/wa/app/{app_id}/callback",
    headers={"apikey": api_key, "Content-Type": "application/x-www-form-urlencoded"},
    data={"url": webhook_url, "modes": "SENT,DELIVERED,READ,OTHERS,FAILED,MESSAGE,TEMPLATE,ENQUEUED"},
)
print(f"  Callback set: {r.status_code}")

# Template has: body (no params), URL button with {{1}}
# The URL pattern is: https://sis-kis.web.app/contact-update/{{1}}

tests = [
    # A: No params at all (pure static template)
    ("A: no params", {"id": "contact_update_request_1", "params": []}),
    
    # B: Full URL as single param
    ("B: full URL", {"id": "contact_update_request_1", "params": ["https://sis-kis.web.app/contact-update/test-token-123"]}),
    
    # C: Just the suffix (current approach)
    ("C: suffix only", {"id": "contact_update_request_1", "params": ["test-token-123"]}),
    
    # D: Template UUID instead of name
    ("D: UUID + suffix", {"id": "23cf7f12-d2b2-436b-854d-6ae47ec10a14", "params": ["test-token-123"]}),
    
    # E: Use elementName format 
    ("E: with language", {"id": "contact_update_request_1", "params": ["test-token-123"], "language": "en"}),
]

for label, tmpl_obj in tests:
    template = json.dumps(tmpl_obj)
    r = requests.post(
        "https://api.gupshup.io/wa/api/v1/template/msg",
        headers={"apikey": api_key, "Content-Type": "application/x-www-form-urlencoded"},
        data={"source": source, "destination": dest, "template": template, "src.name": app_name},
    )
    msg_id = r.json().get("messageId", "none")
    print(f"\n{label}: submitted ({msg_id})")

# Wait for callbacks
print("\n\n=== Waiting 15 seconds for delivery callbacks... ===")
time.sleep(15)

# Check results
r = requests.get(f"https://webhook.site/token/{webhook_uuid}/requests?sorting=newest", timeout=10)
reqs = r.json()
data_list = reqs.get("data", [])
print(f"\nTotal callbacks: {reqs.get('total', len(data_list))}")

for item in data_list:
    body = item.get("content", "")
    try:
        parsed = json.loads(body)
        payload = parsed.get("payload", {})
        msg_type = parsed.get("type", "")
        msg_id = payload.get("id", "")
        status = payload.get("type", "")
        reason = payload.get("payload", {})
        print(f"  [{msg_type}] id={msg_id[:12]}... status={status} detail={reason}")
    except:
        print(f"  Raw: {body[:200]}")

# Restore callback
r = requests.put(
    f"https://api.gupshup.io/wa/app/{app_id}/callback",
    headers={"apikey": api_key, "Content-Type": "application/x-www-form-urlencoded"},
    data={"url": "https://sis-kis.web.app/api/whatsapp/webhook", "modes": "SENT,DELIVERED,READ,OTHERS,FAILED,MESSAGE,TEMPLATE,ACCOUNT,BILLING,ENQUEUED"},
)
print(f"\nCallback restored: {r.status_code}")
