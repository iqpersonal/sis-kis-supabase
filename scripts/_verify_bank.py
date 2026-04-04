import firebase_admin
from firebase_admin import credentials, firestore
import os

KEY = os.path.join("dashboard", "serviceAccountKey.json")
if not firebase_admin._apps:
    firebase_admin.initialize_app(credentials.Certificate(KEY))
db = firestore.client()

docs = db.collection("quiz_questions").where("created_by", "==", "system").get()
dist = {}
for d in docs:
    data = d.to_dict()
    k = (data.get("class_code","?"), data.get("subject","?"), data.get("difficulty",0))
    dist[k] = dist.get(k, 0) + 1

total = sum(dist.values())
print("Total system questions:", total)
print()
thin = 0
for band in ["pre-k","k-2","3-5","6-8","9-12"]:
    print("---", band.upper(), "---")
    for subj in ["Mathematics","Reading","Language Usage","Science","General Knowledge"]:
        parts = []
        for d in range(1,6):
            c = dist.get((band,subj,d), 0)
            parts.append("D%d:%d" % (d, c))
            if c < 3: thin += 1
        t = sum(dist.get((band,subj,d),0) for d in range(1,6))
        print("  %-22s %s  = %d" % (subj, " | ".join(parts), t))
    print()
print("Thin cells (< 3):", thin)
