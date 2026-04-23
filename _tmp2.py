import firebase_admin
from firebase_admin import credentials, firestore
import json

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
    app = firebase_admin.get_app()
db = firestore.client()

docs = db.collection('whatsapp_messages').order_by('created_at', direction=firestore.Query.DESCENDING).limit(3).get()
print('Latest 3 records:')
for d in docs:
    data = d.to_dict()
    print()
    print('  Time: ' + str(data.get('created_at')))
    print('  Template: ' + str(data.get('templateName')))
    print('  Audience: ' + str(data.get('audience')))
    print('  Filter: ' + str(data.get('audience_filter')))
    print('  Total: ' + str(data.get('total_recipients')) + '  Sent: ' + str(data.get('sent')) + '  Failed: ' + str(data.get('failed')))
