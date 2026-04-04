"""Final patch: fills the last 4 thin cells in grade 9-12."""
import os, firebase_admin
from firebase_admin import credentials, firestore

KEY = os.path.join(os.path.dirname(__file__), "..", "dashboard", "serviceAccountKey.json")
if not firebase_admin._apps:
    firebase_admin.initialize_app(credentials.Certificate(KEY))
db = firestore.client()

PATCH = [
    # 9-12 / Reading / D2 (need 1 more)
    ("9-12", "Reading", "What is a 'conflict' in a story?", ["The setting", "A struggle or problem", "The theme", "The ending"], "B", 2, "Conflict = problem characters face.", "RL.9.3"),
    # 9-12 / Language Usage / D2 (need 2 more)
    ("9-12", "Language Usage", "What type of word is 'quickly'?", ["Noun", "Verb", "Adjective", "Adverb"], "D", 2, "Adverbs describe how actions are done.", "L.9.1"),
    ("9-12", "Language Usage", "Which punctuation ends a declarative sentence?", ["Question mark", "Exclamation mark", "Period", "Semicolon"], "C", 2, "Declarative sentences end with a period.", "L.9.2"),
    # 9-12 / Science / D1 (need 2 more)
    ("9-12", "Science", "What planet is known as the Red Planet?", ["Venus", "Mars", "Jupiter", "Saturn"], "B", 1, "Mars appears red due to iron oxide.", "HS-ESS1-1"),
    ("9-12", "Science", "What organ pumps blood through the body?", ["Brain", "Lungs", "Heart", "Liver"], "C", 1, "The heart pumps blood.", "HS-LS1-2"),
    # 9-12 / General Knowledge / D5 (need 1 more)
    ("9-12", "General Knowledge", "What is 'machine learning'?", ["A type of robot", "Algorithms that improve through data", "A programming language", "Computer hardware"], "B", 5, "ML = algorithms learning from data.", "GK.912.5"),
]

labels = ["A", "B", "C", "D"]
batch = db.batch()
for band, subj, text, opts, correct, diff, expl, std in PATCH:
    opt_objs = [{"label": labels[i], "text": o, "text_ar": ""} for i, o in enumerate(opts)]
    batch.set(db.collection("quiz_questions").document(), {
        "text": text, "text_ar": "", "type": "mcq",
        "subject": subj, "class_code": band,
        "difficulty": diff, "options": opt_objs,
        "correct_option": correct, "explanation": expl,
        "standard": std, "created_by": "system",
        "year": "25-26",
        "created_at": firestore.SERVER_TIMESTAMP,
        "updated_at": firestore.SERVER_TIMESTAMP,
    })
batch.commit()
print("Patched %d questions. Done." % len(PATCH))
