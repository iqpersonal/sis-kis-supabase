import firebase_admin
from firebase_admin import credentials, firestore
import json

sa_key = None
with open('dashboard/.env.local', encoding='utf-8') as f:
    for line in f:
        if line.startswith('SA_KEY='):
            sa_key = json.loads(line[7:].strip())
            break

if not sa_key:
    print('ERROR: SA_KEY not found')
    exit(1)

cred = credentials.Certificate(sa_key)
app = firebase_admin.initialize_app(cred)
db = firestore.client()

docs = db.collection('whatsapp_messages').order_by('created_at', direction=firestore.Query.DESCENDING).limit(5).get()
print('Last ' + str(len(docs)) + ' whatsapp_messages records:')
for d in docs:
    data = d.to_dict()
    ts = data.get('created_at')
    print()
    print('  ID: ' + str(d.id))
    print('  Time: ' + str(ts))
    print('  Mode: ' + str(data.get('mode')))
    print('  Template: ' + str(data.get('templateName')))
    print('  Audience: ' + str(data.get('audience')))
    print('  Filter: ' + str(data.get('audience_filter')))
    print('  Sender: ' + str(data.get('sender')))
    print('  Total: ' + str(data.get('total_recipients')) + '  Sent: ' + str(data.get('sent')) + '  Failed: ' + str(data.get('failed')))
