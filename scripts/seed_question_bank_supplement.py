"""
Supplement: fills thin difficulty cells (< 3 questions) that seed_question_bank_v2 flagged.
Run AFTER v2. Adds ~130 questions to bring every cell to 3+.
"""
import os, sys, time
try:
    import firebase_admin
    from firebase_admin import credentials, firestore
except ImportError:
    sys.exit("firebase-admin required")

KEY_PATH = os.path.join(os.path.dirname(__file__), "serviceAccountKey.json")
if not os.path.exists(KEY_PATH):
    KEY_PATH = os.path.join(os.path.dirname(__file__), "..", "dashboard", "serviceAccountKey.json")
if not firebase_admin._apps:
    firebase_admin.initialize_app(credentials.Certificate(KEY_PATH))
db = firestore.client()

YEAR = "25-26"
CREATED_BY = "system"

# (grade_band, subject) → [(text, [A,B,C,D], correct, difficulty, explanation, standard)]
SUPPLEMENT = {}

# ═══════════════════════════════════════════════════════════════
# PRE-K  — need D4 & D5 across subjects
# ═══════════════════════════════════════════════════════════════

SUPPLEMENT[("pre-k", "Mathematics")] = [
    ("What is 5 - 2?", ["1", "2", "3", "4"], "C", 4, "5 - 2 = 3.", "PK.OA.2"),
    ("If you have 6 blocks and give 3 away, how many left?", ["2", "3", "4", "5"], "B", 5, "6 - 3 = 3.", "PK.OA.2"),
    ("What shape has NO corners?", ["Square", "Triangle", "Circle", "Rectangle"], "C", 5, "A circle has no corners.", "PK.G.2"),
]

SUPPLEMENT[("pre-k", "Reading")] = [
    ("Which word starts with the same sound as 'king'?", ["Ball", "Kite", "Dog", "Sun"], "B", 4, "Kite and King both start with 'k'.", "PK.RF.2"),
    ("How many words are in 'The dog runs fast'?", ["2", "3", "4", "5"], "C", 4, "The (1) dog (2) runs (3) fast (4).", "PK.RF.1"),
    ("Put the story in order: 'egg → caterpillar → butterfly'", ["Correct", "butterfly → egg → caterpillar", "caterpillar → butterfly → egg", "egg → butterfly → caterpillar"], "A", 5, "Egg → caterpillar → butterfly is the correct order.", "PK.RL.2"),
    ("If a character is smiling in the picture, how does she feel?", ["Sad", "Angry", "Happy", "Scared"], "C", 5, "Smiling shows happiness.", "PK.RL.3"),
]

SUPPLEMENT[("pre-k", "Language Usage")] = [
    ("Which sentence is correct? 'He ___ a book.'", ["read", "reads", "reading", "readed"], "B", 4, "'He reads a book.'", "PK.L.1"),
    ("What word means the same as 'little'?", ["Big", "Tiny", "Tall", "Heavy"], "B", 5, "Tiny = little.", "PK.L.5"),
    ("What is the opposite of 'light'?", ["Soft", "Bright", "Dark", "Small"], "C", 5, "Light and dark are opposites.", "PK.L.5"),
]

SUPPLEMENT[("pre-k", "Science")] = [
    ("What happens in autumn? Leaves ___.", ["Grow bigger", "Fall off trees", "Turn blue", "Disappear"], "B", 4, "In autumn, leaves change color and fall.", "PK.ESS.2"),
    ("Magnets stick to which material?", ["Wood", "Paper", "Metal", "Plastic"], "C", 5, "Magnets attract metal objects.", "PK.PS.2"),
    ("What do humans need to breathe?", ["Water", "Food", "Air", "Sunshine"], "C", 5, "Humans breathe air.", "PK.LS.1"),
]

SUPPLEMENT[("pre-k", "General Knowledge")] = [
    ("Which tool do we use to cut paper?", ["Pen", "Scissors", "Ruler", "Glue"], "B", 4, "We use scissors to cut paper.", "PK.GK.2"),
    ("What is the first month of the year?", ["February", "March", "January", "December"], "C", 5, "January is the first month.", "PK.GK.3"),
    ("What animal gives us milk?", ["Chicken", "Cow", "Fish", "Dog"], "B", 5, "Cows give us milk.", "PK.GK.3"),
]

# ═══════════════════════════════════════════════════════════════
# K-2  — need D4/D5 and some D1
# ═══════════════════════════════════════════════════════════════

SUPPLEMENT[("k-2", "Reading")] = [
    ("What is the opposite of 'old'?", ["Tall", "New", "Big", "Long"], "B", 4, "Old and new are opposites.", "L.2.5"),
    ("What is a 'glossary'?", ["Story ending", "List of words with meanings at back of book", "First page", "Picture"], "B", 4, "A glossary defines key terms.", "RI.2.5"),
    ("Which word best completes: 'The story teaches us to be ___.'", ["Angry", "Kind", "Loud", "Fast"], "B", 5, "Stories often teach moral lessons like kindness.", "RL.2.2"),
    ("What is a 'chapter'?", ["A sentence", "A section of a book", "A paragraph", "A word"], "B", 5, "Books are divided into chapters.", "RL.2.5"),
]

SUPPLEMENT[("k-2", "Language Usage")] = [
    ("What is the past tense of 'jump'?", ["Jumps", "Jumping", "Jumped", "Jumpped"], "C", 4, "Jump + ed = jumped.", "L.1.1"),
    ("Which needs a capital letter?", ["dog", "house", "paris", "table"], "C", 4, "Paris is a proper noun (city name).", "L.2.2"),
    ("Pick the correct spelling.", ["becuz", "becauz", "because", "becouse"], "C", 5, "The correct spelling is 'because'.", "L.2.2"),
    ("Which word is an adverb in 'She sings loudly'?", ["She", "sings", "loudly", "the"], "C", 5, "Loudly describes how she sings.", "L.2.1"),
]

SUPPLEMENT[("k-2", "Science")] = [
    ("What type of animal is a whale?", ["Fish", "Bird", "Mammal", "Reptile"], "C", 4, "Whales are mammals; they breathe air and nurse young.", "2-LS4-1"),
    ("Why do birds fly south in winter?", ["For fun", "To find food and warmth", "To visit friends", "They like to fly"], "B", 4, "Birds migrate to find food and warmer weather.", "2-LS4-1"),
    ("What is the biggest planet in our solar system?", ["Saturn", "Earth", "Jupiter", "Mars"], "C", 5, "Jupiter is the largest planet.", "1-ESS1-1"),
    ("What do lungs do?", ["Pump blood", "Digest food", "Help us breathe", "Help us see"], "C", 5, "Lungs take in oxygen from air.", "1-LS1-1"),
]

SUPPLEMENT[("k-2", "General Knowledge")] = [
    ("Which animal has a long neck?", ["Elephant", "Giraffe", "Tiger", "Bear"], "B", 1, "Giraffes have very long necks.", "GK.K2.1"),
    ("What is a map used for?", ["Cooking", "Showing places", "Playing music", "Reading stories"], "B", 2, "Maps show locations and directions.", "GK.K2.2"),
    ("What language do people in Brazil speak?", ["Spanish", "Portuguese", "French", "English"], "B", 4, "Portuguese is spoken in Brazil.", "GK.K2.3"),
    ("What is the largest animal on Earth?", ["Elephant", "Giraffe", "Blue whale", "Shark"], "C", 4, "The blue whale is the largest animal.", "GK.K2.3"),
    ("What are the primary colors?", ["Red, green, blue", "Red, blue, yellow", "Orange, green, purple", "Pink, black, white"], "B", 5, "Primary colors: red, blue, yellow.", "GK.K2.3"),
    ("Which country is known for pizza and pasta?", ["France", "Spain", "Italy", "Germany"], "C", 5, "Italy is famous for pizza and pasta.", "GK.K2.3"),
]

# ═══════════════════════════════════════════════════════════════
# 3-5  — need D1, some D5
# ═══════════════════════════════════════════════════════════════

SUPPLEMENT[("3-5", "Mathematics")] = [
    ("What is 25 + 30?", ["45", "50", "55", "60"], "C", 1, "25 + 30 = 55.", "3.NBT.2"),
    ("Which is greater: 456 or 465?", ["456", "465", "Equal", "Neither"], "B", 1, "465 > 456.", "3.NBT.1"),
    ("What is 12 × 12?", ["120", "124", "144", "148"], "C", 5, "12 × 12 = 144.", "5.NBT.5"),
    ("Express 7/20 as a decimal.", ["0.25", "0.30", "0.35", "0.40"], "C", 5, "7/20 = 0.35.", "4.NF.6"),
]

SUPPLEMENT[("3-5", "Reading")] = [
    ("What is an 'author'?", ["Reader", "Writer of a book", "Teacher", "Publisher"], "B", 1, "An author writes books.", "RI.3.6"),
    ("What does a 'table of contents' show?", ["Pictures", "Chapter titles and page numbers", "The ending", "The author"], "B", 1, "Helps you find chapters in a book.", "RI.3.5"),
    ("What is the lesson of a story called?", ["Plot", "Setting", "Moral", "Conflict"], "C", 1, "The moral = the lesson.", "RL.3.2"),
    ("What is 'onomatopoeia'?", ["Big words", "Words that sound like what they describe", "Fancy vocabulary", "Silent letters"], "B", 5, "'Buzz,' 'crash,' 'sizzle' = onomatopoeia.", "RL.5.4"),
    ("What is an 'epilogue'?", ["Beginning", "Middle", "Section after the story ends", "Title page"], "C", 5, "An epilogue comes after the main story.", "RL.5.5"),
]

SUPPLEMENT[("3-5", "Language Usage")] = [
    ("Which is a noun: run, big, table, quickly?", ["run", "big", "table", "quickly"], "C", 1, "Table is a thing = noun.", "L.3.1"),
    ("Which sentence ends with a period?", ["What is your name", "Go to school", "Wow", "She is tall."], "D", 1, "Telling sentences end with periods.", "L.3.2"),
    ("'She was so hungry she could eat a horse.' This is a:", ["Fact", "Simile", "Metaphor", "Hyperbole"], "D", 1, "Exaggeration = hyperbole.", "L.3.5"),
    ("What is the superlative of 'tall'?", ["Taller", "More tall", "Tallest", "Most tall"], "C", 5, "Tall → taller → tallest.", "L.3.1"),
]

SUPPLEMENT[("3-5", "Science")] = [
    ("Is the Sun a star or a planet?", ["Planet", "Star", "Moon", "Asteroid"], "B", 1, "The Sun is a star.", "3-ESS1-1"),
    ("What are the three types of rock?", ["Igneous, sedimentary, metamorphic", "Smooth, rough, flat", "Big, medium, small", "Red, gray, white"], "A", 1, "Three rock types.", "4-ESS2-1"),
    ("What are the 4 main layers of Earth?", ["Crust, mantle, outer core, inner core", "Soil, rock, water, air", "Top, middle, bottom, base", "Land, sea, air, space"], "A", 1, "Crust, mantle, outer core, inner core.", "4-ESS2-1"),
    ("What is 'adaptation' in animals?", ["A name", "Changes that help survival", "A habitat", "A food chain"], "B", 5, "Adaptations help organisms survive in their environment.", "3-LS4-3"),
]

SUPPLEMENT[("3-5", "General Knowledge")] = [
    ("What continent is Egypt in?", ["Asia", "Europe", "Africa", "South America"], "C", 1, "Egypt is in Africa.", "GK.35.1"),
    ("What does a thermometer measure?", ["Weight", "Speed", "Temperature", "Distance"], "C", 1, "Thermometers measure temperature.", "GK.35.3"),
    ("What instrument did Beethoven play?", ["Guitar", "Piano", "Violin", "Drums"], "B", 1, "Beethoven was a pianist and composer.", "GK.35.2"),
    ("What is the Great Barrier Reef?", ["A mountain", "A desert", "A coral reef system", "A river"], "C", 5, "World's largest coral reef system, in Australia.", "GK.35.3"),
]

# ═══════════════════════════════════════════════════════════════
# 6-8  — need D1, D2, D5
# ═══════════════════════════════════════════════════════════════

SUPPLEMENT[("6-8", "Mathematics")] = [
    ("What is 7 × 8?", ["48", "54", "56", "64"], "C", 1, "7 × 8 = 56.", "6.NS.2"),
    ("What is 100 ÷ 4?", ["20", "24", "25", "30"], "C", 1, "100 ÷ 4 = 25.", "6.NS.2"),
    ("What is 15 × 3?", ["35", "40", "45", "50"], "C", 1, "15 × 3 = 45.", "6.NS.2"),
    ("Simplify: 12/18", ["1/2", "2/3", "3/4", "4/6"], "B", 2, "12/18 = 2/3.", "6.NS.1"),
    ("Convert 0.75 to fraction.", ["1/2", "2/3", "3/4", "4/5"], "C", 5, "0.75 = 3/4.", "6.RP.3"),
    ("What is the area of a circle with radius 5? (π≈3.14)", ["31.4", "50", "78.5", "157"], "C", 5, "πr² = 3.14 × 25 = 78.5.", "7.G.4"),
]

SUPPLEMENT[("6-8", "Reading")] = [
    ("What part of a book lists chapters?", ["Index", "Glossary", "Table of contents", "Bibliography"], "C", 1, "Table of contents lists chapters.", "RI.6.5"),
    ("What is a 'summary'?", ["Full copy", "Short retelling of main points", "Detailed analysis", "A quote"], "B", 1, "A summary covers main points briefly.", "RI.6.2"),
    ("What does 'empathy' mean?", ["Anger", "Understanding others' feelings", "Intelligence", "Fear"], "B", 1, "Empathy = understanding others' feelings.", "L.6.4"),
    ("What is 'imagery' in writing?", ["Using charts", "Words that create pictures in the mind", "Facts", "Opinions"], "B", 2, "Imagery appeals to the senses.", "RL.6.4"),
    ("What is 'oxymoron'?", ["A smart person", "Two contradictory words together", "A type of poem", "A long word"], "B", 5, "'Jumbo shrimp,' 'bittersweet' = oxymoron.", "RL.8.4"),
    ("What does 'ambiguous' mean?", ["Clear", "Having more than one meaning", "Short", "Loud"], "B", 5, "Ambiguous = open to multiple interpretations.", "L.8.4"),
]

SUPPLEMENT[("6-8", "Language Usage")] = [
    ("Which word is a noun?", ["Jump", "Quickly", "Desk", "Beautiful"], "C", 1, "Desk = thing = noun.", "L.6.1"),
    ("What does a comma do?", ["Ends sentence", "Separates ideas or items", "Starts sentence", "Shows yelling"], "B", 1, "Commas separate items/clauses.", "L.6.2"),
    ("What is a verb?", ["A thing", "An action word", "A place", "A describing word"], "B", 1, "Verbs are action words.", "L.6.1"),
    ("What is a 'pronoun'?", ["A noun's name", "A word replacing a noun", "A type of verb", "An adjective"], "B", 2, "Pronouns replace nouns: he, she, it.", "L.6.1"),
    ("What are 'quotation marks' used for?", ["Math", "Someone's exact words", "Titles only", "Dates"], "B", 2, "Quotation marks show direct speech.", "L.6.2"),
    ("What is 'euphemism'?", ["A harsh word", "A mild expression for something unpleasant", "A greeting", "A question"], "B", 5, "'Passed away' instead of 'died'.", "L.8.5"),
    ("What is 'rhetoric' in writing?", ["A poem type", "The art of persuasive communication", "A novel genre", "A grammar rule"], "B", 5, "Persuasive language techniques.", "L.8.3"),
]

SUPPLEMENT[("6-8", "Science")] = [
    ("What is oxygen's chemical symbol?", ["Ox", "O", "O2", "Og"], "B", 1, "Oxygen = O.", "MS-PS1-1"),
    ("What do herbivores eat?", ["Meat", "Plants", "Both", "Minerals"], "B", 2, "Herbivores eat plants.", "MS-LS2-3"),
    ("How many bones in adult human body?", ["106", "206", "306", "406"], "B", 2, "206 bones.", "MS-LS1-3"),
    ("What is the function of white blood cells?", ["Carry oxygen", "Fight infections", "Clot blood", "Digest food"], "B", 5, "White blood cells fight disease.", "MS-LS1-8"),
    ("What is the theory of plate tectonics?", ["Earth is flat", "Earth's crust moves on plates", "Earth doesn't change", "Only volcanoes move"], "B", 5, "Earth's surface is divided into moving plates.", "MS-ESS2-3"),
]

SUPPLEMENT[("6-8", "General Knowledge")] = [
    ("What is the capital of Japan?", ["Osaka", "Tokyo", "Kyoto", "Seoul"], "B", 1, "Tokyo is Japan's capital.", "GK.68.1"),
    ("Which gas do we breathe in?", ["CO2", "Nitrogen", "Oxygen", "Helium"], "C", 1, "We breathe in oxygen.", "GK.68.2"),
    ("What is the capital of Australia?", ["Sydney", "Melbourne", "Canberra", "Brisbane"], "C", 1, "Canberra is Australia's capital.", "GK.68.1"),
    ("What was the Industrial Revolution?", ["A war", "Shift from farming to factory-based economy", "A scientific theory", "A type of government"], "B", 5, "Transition to industrialized manufacturing.", "GK.68.3"),
    ("What is 'inflation' in economics?", ["More money", "General increase in prices over time", "Tax increase", "Deflation"], "B", 5, "Prices rise, purchasing power falls.", "GK.68.4"),
]

# ═══════════════════════════════════════════════════════════════
# 9-12  — need D1, D2, D5
# ═══════════════════════════════════════════════════════════════

SUPPLEMENT[("9-12", "Mathematics")] = [
    ("What is 15 × 12?", ["150", "160", "170", "180"], "D", 1, "15 × 12 = 180.", "HSN.Q.1"),
    ("What is the area of a rectangle 10 by 5?", ["15", "30", "40", "50"], "D", 1, "10 × 5 = 50.", "HSG.GPE.7"),
    ("What is 3³?", ["9", "18", "27", "81"], "C", 1, "3 × 3 × 3 = 27.", "HSN.RN.1"),
    ("What is the derivative of x³?", ["x²", "2x²", "3x²", "3x"], "C", 5, "Power rule: 3x².", "HSF.IF.6"),
    ("What is the integral of cos(x)?", ["sin(x)+C", "-sin(x)+C", "cos(x)+C", "tan(x)+C"], "A", 5, "∫cos(x)dx = sin(x)+C.", "HSF.IF.6"),
    ("Solve: x³ - 8 = 0", ["x=2", "x=4", "x=8", "x=±2"], "A", 5, "x³=8, x=2.", "HSA.REI.4"),
]

SUPPLEMENT[("9-12", "Reading")] = [
    ("What is the 'plot' of a story?", ["Characters", "Setting", "Sequence of events", "Theme"], "C", 1, "Plot = what happens in a story.", "RL.9.5"),
    ("What is a 'protagonist'?", ["Villain", "Main character", "Side character", "Narrator"], "B", 1, "Protagonist = main character.", "RL.9.3"),
    ("What does 'genre' mean?", ["Author style", "Category of literature", "Time period", "Point of view"], "B", 1, "Genre = type (mystery, sci-fi, romance, etc.).", "RL.9.5"),
    ("What is 'existentialism' in literature?", ["A poetic form", "Philosophy exploring meaning and individual freedom", "A plot device", "A grammar rule"], "B", 5, "Questioning purpose and existence.", "RL.11.4"),
    ("What is 'postmodernism'?", ["After World War I", "Literary movement questioning reality and traditional narratives", "A poetry type", "Historical fiction"], "B", 5, "Challenges established literary conventions.", "RL.11.9"),
]

SUPPLEMENT[("9-12", "Language Usage")] = [
    ("What is a complete sentence?", ["A word", "A phrase", "Has subject, verb, and complete thought", "Two words"], "C", 1, "Subject + verb + complete thought.", "L.9.1"),
    ("Which is a proper noun?", ["city", "dog", "London", "river"], "C", 1, "London = specific place = proper noun.", "L.9.1"),
    ("What is a synonym?", ["Opposite word", "Word with similar meaning", "Rhyming word", "Big word"], "B", 1, "Same or similar meaning.", "L.9.5"),
    ("What is a 'gerund'?", ["Past tense verb", "Verb form ending in -ing used as noun", "An adjective", "A pronoun"], "B", 4, "'Swimming is fun' — swimming = gerund.", "L.9.1"),
    ("What is a 'run-on sentence'?", ["Very long sentence", "Two+ independent clauses without proper punctuation", "Sentence fragment", "Question"], "B", 5, "Fused or comma-spliced clauses.", "L.9.1"),
]

SUPPLEMENT[("9-12", "Science")] = [
    ("How many elements on the periodic table (approx)?", ["50", "90", "118", "200"], "C", 2, "~118 known elements.", "HS-PS1-1"),
    ("What is Newton's second law?", ["Inertia", "F = ma", "Equal/opposite reaction", "Gravity"], "B", 2, "Force = mass × acceleration.", "HS-PS2-1"),
    ("What is the formula for speed?", ["s=d×t", "s=d/t", "s=t/d", "s=d+t"], "B", 2, "Speed = distance/time.", "HS-PS2-2"),
    ("What is the Doppler Effect?", ["Light bending", "Change in wave frequency due to motion", "Sound echo", "Light speed"], "B", 5, "Moving source changes observed frequency.", "HS-PS4-1"),
]

SUPPLEMENT[("9-12", "General Knowledge")] = [
    ("Who was the first President of the USA?", ["Lincoln", "Jefferson", "Washington", "Adams"], "C", 1, "George Washington.", "GK.912.1"),
    ("What is the capital of the UK?", ["Manchester", "Edinburgh", "London", "Dublin"], "C", 1, "London.", "GK.912.1"),
    ("What does UN stand for?", ["United Nations", "Universal Network", "United Network", "Union of Nations"], "A", 1, "United Nations.", "GK.912.3"),
    ("What is 'artificial intelligence'?", ["Robot", "Machine mimicking human intelligence", "A programming language", "A computer brand"], "B", 5, "Machines performing tasks requiring human intelligence.", "GK.912.5"),
    ("What is 'quantum computing'?", ["Fast regular computer", "Computing using quantum bits (qubits)", "A programming language", "Cloud computing"], "B", 5, "Uses quantum mechanics for computation.", "GK.912.5"),
]


# ─────────────────────────────────────────────────────────────
def seed_supplement():
    total = 0
    batch = db.batch()
    bc = 0

    labels = ["A", "B", "C", "D"]

    for (grade_band, subject), qs in SUPPLEMENT.items():
        for q in qs:
            text, options, correct, difficulty, explanation, *rest = q
            standard = rest[0] if rest else ""
            opt_objs = [{"label": labels[i], "text": o, "text_ar": ""} for i, o in enumerate(options)]
            doc = {
                "text": text,
                "text_ar": "",
                "type": "mcq",
                "subject": subject,
                "class_code": grade_band,
                "difficulty": difficulty,
                "options": opt_objs,
                "correct_option": correct,
                "explanation": explanation,
                "standard": standard,
                "created_by": CREATED_BY,
                "year": YEAR,
                "created_at": firestore.SERVER_TIMESTAMP,
                "updated_at": firestore.SERVER_TIMESTAMP,
            }
            batch.set(db.collection("quiz_questions").document(), doc)
            total += 1
            bc += 1
            if bc >= 400:
                batch.commit()
                batch = db.batch()
                bc = 0
                import time; time.sleep(0.3)

    if bc > 0:
        batch.commit()

    print(f"✅  Supplement complete: added {total} questions.")

if __name__ == "__main__":
    print("📦  Seeding supplement questions...\n")
    seed_supplement()
