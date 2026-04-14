import requests
import json
import time

api_key = "sk_90716b3967b5458487ba71ea8f8e8738"
app_id = "cee38c05-f353-4fe0-b02b-0dc5d8e61dc3"
source = "966531403994"
app_name = "kisapp"
dest = "966569670909"

# 1. Create a webhook.site token to capture callbacks
print("=== 1. Creating webhook.site endpoint ===")
r = requests.post("https://webhook.site/token", timeout=10)
if r.status_code == 201 or r.status_code == 200:
    token_data = r.json()
    webhook_uuid = token_data.get("uuid")
    webhook_url = f"https://webhook.site/{webhook_uuid}"
    print(f"  Webhook URL: {webhook_url}")
else:
    print(f"  Failed: {r.status_code} {r.text[:200]}")
    # Fallback: use a known pattern
    webhook_url = None

if webhook_url:
    # 2. Update Gupshup callback to point to webhook.site
    print("\n=== 2. Set callback to webhook.site ===")
    r = requests.put(
        f"https://api.gupshup.io/wa/app/{app_id}/callback",
        headers={"apikey": api_key, "Content-Type": "application/x-www-form-urlencoded"},
        data={"url": webhook_url, "modes": "SENT,DELIVERED,READ,OTHERS,FAILED,MESSAGE,TEMPLATE,ENQUEUED"},
    )
    print(f"  Update: {r.status_code} {r.text[:300]}")

    # 3. Send a test message
    print("\n=== 3. Sending test template ===")
    template = json.dumps({"id": "contact_update_request_1", "params": ["webhook-site-test"]})
    r = requests.post(
        "https://api.gupshup.io/wa/api/v1/template/msg",
        headers={"apikey": api_key, "Content-Type": "application/x-www-form-urlencoded"},
        data={"source": source, "destination": dest, "template": template, "src.name": app_name},
    )
    msg_data = r.json()
    msg_id = msg_data.get("messageId", "none")
    print(f"  Sent: {r.status_code} {r.text[:300]}")
    print(f"  Message ID: {msg_id}")

    # 4. Wait and check webhook.site for callbacks
    print("\n=== 4. Waiting 10 seconds for callbacks... ===")
    time.sleep(10)
    
    print("\n=== 5. Checking webhook.site for requests ===")
    r = requests.get(
        f"https://webhook.site/token/{webhook_uuid}/requests?sorting=newest",
        timeout=10,
    )
    if r.status_code == 200:
        reqs = r.json()
        data_list = reqs.get("data", [])
        print(f"  Total callbacks received: {reqs.get('total', len(data_list))}")
        for i, req_data in enumerate(data_list[:5]):
            print(f"\n  --- Callback {i+1} ---")
            print(f"  Method: {req_data.get('method')}")
            content = req_data.get("content", "")
            print(f"  Body: {content[:500]}")
    else:
        print(f"  Check failed: {r.status_code}")
    
    # 6. Restore callback to our webhook
    print("\n=== 6. Restoring callback to our webhook ===")
    r = requests.put(
        f"https://api.gupshup.io/wa/app/{app_id}/callback",
        headers={"apikey": api_key, "Content-Type": "application/x-www-form-urlencoded"},
        data={"url": "https://sis-kis.web.app/api/whatsapp/webhook", "modes": "SENT,DELIVERED,READ,OTHERS,FAILED,MESSAGE,TEMPLATE,ACCOUNT,BILLING,ENQUEUED"},
    )
    print(f"  Restored: {r.status_code}")
