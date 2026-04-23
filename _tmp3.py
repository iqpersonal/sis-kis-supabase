import firebase_admin
from firebase_admin import credentials, firestore
import json
from datetime import datetime, timezone

sa_key = None
with open('dashboard/.env.local', encoding='utf-8') as f:
    for line in f:
        if line.startswith('SA_KEY='):
            sa_key = json.loads(line[7:].strip())
            break

cred = credentials.Certificate(sa_key)
try:
    app = firebase_admin.initialize_app(cred)
except:
    pass
db = firestore.client()

# 1. Get ALL records (no ordering) to catch null timestamps
print('=== All whatsapp_messages (unordered, last 20) ===')
docs = db.collection('whatsapp_messages').limit(20).get()
print(f'Count: {len(docs)}')
for d in docs:
    data = d.to_dict()
    ts = data.get('created_at')
    print(f'  {d.id[:12]} | {ts} | tmpl={data.get("templateName")} | aud={data.get("audience")} | total={data.get("total_recipients")} sent={data.get("sent")}')

# 2. Check how many families exist and what phones they have
print()
print('=== Families sample (first 5 with phones) ===')
fams = db.collection('families').limit(100).get()
with_phone = [(d.id, d.to_dict().get('father_phone',''), d.to_dict().get('family_number','')) for d in fams if d.to_dict().get('father_phone','').strip()]
print(f'Families with father_phone: {len(with_phone)} out of {len(fams)}')
for fid, ph, fn in with_phone[:5]:
    print(f'  family_number={fn} father_phone={ph}')
