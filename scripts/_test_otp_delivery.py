import requests, json, time

api_key = 'sk_90716b3967b5458487ba71ea8f8e8738'
app_id = 'cee38c05-f353-4fe0-b02b-0dc5d8e61dc3'

# Setup webhook.site
r = requests.post('https://webhook.site/token', timeout=10)
uid = r.json()['uuid']
url = f'https://webhook.site/{uid}'
print(f"Webhook: {url}")

requests.put(
    f'https://api.gupshup.io/wa/app/{app_id}/callback',
    headers={'apikey': api_key, 'Content-Type': 'application/x-www-form-urlencoded'},
    data={'url': url, 'modes': 'SENT,DELIVERED,FAILED,ENQUEUED'}
)

# Send text (session message)
msg = json.dumps({'type': 'text', 'text': 'OTP Test: 654321'})
r = requests.post(
    'https://api.gupshup.io/wa/api/v1/msg',
    headers={'apikey': api_key, 'Content-Type': 'application/x-www-form-urlencoded'},
    data={'channel': 'whatsapp', 'source': '966531403994', 'destination': '966569670909',
          'message': msg, 'src.name': 'kisapp'}
)
mid = r.json().get('messageId', '?')
print(f'Sent text: {mid}')

time.sleep(10)

r = requests.get(f'https://webhook.site/token/{uid}/requests?sorting=newest', timeout=10)
for item in r.json().get('data', []):
    body = item.get('content', '')
    try:
        p = json.loads(body)
        payload = p.get('payload', {})
        print(f"  [{p.get('type')}] status={payload.get('type')} detail={payload.get('payload', {})}")
    except:
        print(f'  Raw: {body[:150]}')

# Restore callback
requests.put(
    f'https://api.gupshup.io/wa/app/{app_id}/callback',
    headers={'apikey': api_key, 'Content-Type': 'application/x-www-form-urlencoded'},
    data={'url': 'https://sis-kis.web.app/api/whatsapp/webhook',
          'modes': 'SENT,DELIVERED,READ,OTHERS,FAILED,MESSAGE,TEMPLATE,ACCOUNT,BILLING,ENQUEUED'}
)
print("Callback restored")
