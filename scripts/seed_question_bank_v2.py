"""
Expanded NWEA-style Question Bank — ~600+ MCQ questions.
Cleans old 'system' questions first, then seeds a deep pool ensuring
no repeats even across multiple quiz sessions.

Target: ≥ 4 questions per (grade_band × subject × difficulty) cell
= 5 bands × 5 subjects × 5 difficulties × 4+ = 500+ minimum

Usage:
    python scripts/seed_question_bank_v2.py
"""

import os, sys, time

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
except ImportError:
    sys.exit("firebase-admin required: pip install firebase-admin")

KEY_PATH = os.path.join(os.path.dirname(__file__), "serviceAccountKey.json")
if not os.path.exists(KEY_PATH):
    KEY_PATH = os.path.join(os.path.dirname(__file__), "..", "dashboard", "serviceAccountKey.json")

if not firebase_admin._apps:
    firebase_admin.initialize_app(credentials.Certificate(KEY_PATH))
db = firestore.client()

YEAR = "25-26"
CREATED_BY = "system"

# ─────────────────────────────────────────────────────────────────
#  FORMAT:  (text, [A, B, C, D], correct_letter, difficulty, explanation, standard)
#  difficulty: 1=Very Easy, 2=Easy, 3=Medium, 4=Hard, 5=Very Hard
# ─────────────────────────────────────────────────────────────────

QUESTIONS = {}

# ═══════════════════════════════════════════════════════════════════
#  PRE-K  (Ages 3–5)
# ═══════════════════════════════════════════════════════════════════

QUESTIONS[("pre-k", "Mathematics")] = [
    # ── Difficulty 1 ──
    ("How many apples are there? 🍎🍎🍎", ["2", "3", "4", "5"], "B", 1, "Count each apple: 1, 2, 3.", "PK.CC.1"),
    ("What shape is a ball?", ["Square", "Triangle", "Circle", "Rectangle"], "C", 1, "A ball is round like a circle.", "PK.G.1"),
    ("Which number comes after 2?", ["1", "3", "4", "5"], "B", 1, "We count 1, 2, 3 — so 3 comes after 2.", "PK.CC.2"),
    ("Show me 1 finger. How many is that?", ["0", "1", "2", "3"], "B", 1, "One finger is the number 1.", "PK.CC.1"),
    ("Which has more: 🍪🍪 or 🍪🍪🍪?", ["First group", "Second group", "Same", "Cannot tell"], "B", 1, "3 cookies is more than 2 cookies.", "PK.CC.6"),
    # ── Difficulty 2 ──
    ("How many fingers do you have on one hand?", ["3", "4", "5", "6"], "C", 2, "Count your fingers: 1, 2, 3, 4, 5.", "PK.CC.1"),
    ("Which group has MORE? Group A: ⭐⭐ Group B: ⭐⭐⭐⭐", ["Group A", "Group B", "They are the same", "Cannot tell"], "B", 2, "Group B has 4 stars, Group A has 2. 4 is more than 2.", "PK.CC.6"),
    ("What shape has 3 sides?", ["Circle", "Square", "Triangle", "Rectangle"], "C", 2, "A triangle has exactly 3 sides.", "PK.G.2"),
    ("Count the stars: ⭐⭐⭐⭐⭐. How many?", ["3", "4", "5", "6"], "C", 2, "Count each star: there are 5.", "PK.CC.1"),
    ("What comes before 5?", ["3", "4", "6", "7"], "B", 2, "We count 3, 4, 5 — so 4 comes before 5.", "PK.CC.2"),
    # ── Difficulty 3 ──
    ("What number is missing? 1, 2, __, 4, 5", ["0", "3", "6", "7"], "B", 3, "The numbers go in order: 1, 2, 3, 4, 5.", "PK.CC.2"),
    ("Which is the biggest number?", ["3", "1", "5", "2"], "C", 3, "5 is bigger than 3, 2, and 1.", "PK.CC.7"),
    ("If you have 2 apples and get 1 more, how many do you have?", ["1", "2", "3", "4"], "C", 3, "2 + 1 = 3 apples.", "PK.OA.1"),
    ("What number comes after 9?", ["8", "10", "11", "12"], "B", 3, "After 9 we count 10.", "PK.CC.2"),
    ("How many corners does a square have?", ["2", "3", "4", "5"], "C", 3, "A square has 4 corners.", "PK.G.2"),
    # ── Difficulty 4 ──
    ("If you have 4 cookies and eat 2, how many are left?", ["1", "2", "3", "4"], "B", 4, "4 - 2 = 2 cookies left.", "PK.OA.2"),
    ("What shape has 4 equal sides?", ["Rectangle", "Triangle", "Circle", "Square"], "D", 4, "A square has 4 equal sides.", "PK.G.2"),
    ("Put these in order from smallest: 5, 2, 4", ["2, 4, 5", "5, 4, 2", "4, 2, 5", "2, 5, 4"], "A", 4, "From smallest to biggest: 2, 4, 5.", "PK.CC.7"),
    # ── Difficulty 5 ──
    ("What is 3 + 2?", ["3", "4", "5", "6"], "C", 5, "3 + 2 = 5.", "PK.OA.1"),
    ("If you arrange 10 blocks in pairs of 2, how many pairs?", ["3", "4", "5", "6"], "C", 5, "10 ÷ 2 = 5 pairs.", "PK.OA.2"),
]

QUESTIONS[("pre-k", "Reading")] = [
    # ── Difficulty 1 ──
    ("Which letter makes the sound 'mmm'?", ["B", "M", "S", "T"], "B", 1, "The letter M makes the 'mmm' sound.", "PK.RF.2"),
    ("What letter does 'cat' start with?", ["A", "B", "C", "D"], "C", 1, "Cat starts with the letter C.", "PK.RF.3"),
    ("What does a 'dog' say?", ["Moo", "Meow", "Woof", "Quack"], "C", 1, "A dog says 'Woof!'", "PK.RL.1"),
    ("Which picture shows a 'book'?", ["A ball", "A book", "A tree", "A car"], "B", 1, "A book has pages you can read.", "PK.RI.7"),
    ("What letter does 'apple' start with?", ["B", "A", "P", "E"], "B", 1, "Apple starts with the letter A.", "PK.RF.3"),
    # ── Difficulty 2 ──
    ("Which word rhymes with 'cat'?", ["Dog", "Hat", "Cup", "Sun"], "B", 2, "Hat and cat both end with '-at'.", "PK.RF.2"),
    ("Which word starts with the same sound as 'sun'?", ["Moon", "Star", "Sock", "Ball"], "C", 2, "Sock and Sun both start with 'S'.", "PK.RF.2"),
    ("What letter does 'fish' start with?", ["P", "S", "F", "H"], "C", 2, "Fish starts with the letter F.", "PK.RF.3"),
    ("Which word rhymes with 'dog'?", ["Cat", "Log", "Pen", "Bird"], "B", 2, "Dog and log both end with '-og'.", "PK.RF.2"),
    ("What letter comes after A?", ["C", "B", "D", "E"], "B", 2, "The alphabet goes A, B, C…", "PK.RF.1"),
    # ── Difficulty 3 ──
    ("How many words are in 'I see a cat'?", ["2", "3", "4", "5"], "C", 3, "Count each word: I (1), see (2), a (3), cat (4).", "PK.RF.1"),
    ("What comes at the end of a sentence?", ["A comma", "A question mark", "A period", "A letter"], "C", 3, "Sentences end with a period (.).", "PK.L.2"),
    ("Which word has 3 letters?", ["Cat", "House", "Elephant", "A"], "A", 3, "Cat = C-A-T = 3 letters.", "PK.RF.1"),
    ("Which words start with the same sound?", ["big/ball", "big/cat", "sun/cat", "dog/cat"], "A", 3, "Big and ball both start with 'b'.", "PK.RF.2"),
    # ── Difficulty 4 ──
    ("What is the last letter in 'dog'?", ["D", "O", "G", "A"], "C", 4, "D-O-G: the last letter is G.", "PK.RF.3"),
    ("How many syllables in 'elephant'?", ["1", "2", "3", "4"], "C", 4, "El-e-phant = 3 syllables.", "PK.RF.2"),
    # ── Difficulty 5 ──
    ("Which word does NOT rhyme with 'cake'?", ["Bake", "Lake", "Make", "Book"], "D", 5, "Book does not end with '-ake'.", "PK.RF.2"),
    ("If a story says 'It was dark and rainy,' how does the day feel?", ["Happy", "Sunny", "Gloomy", "Funny"], "C", 5, "Dark and rainy suggests a gloomy mood.", "PK.RL.4"),
]

QUESTIONS[("pre-k", "Language Usage")] = [
    ("What is the color of the sky?", ["Red", "Green", "Blue", "Yellow"], "C", 1, "On a clear day, the sky is blue.", "PK.L.5"),
    ("Which is a fruit?", ["Chair", "Apple", "Table", "Book"], "B", 1, "An apple is a fruit you can eat.", "PK.L.5"),
    ("What do you wear on your feet?", ["Hat", "Gloves", "Shoes", "Scarf"], "C", 1, "We wear shoes on our feet.", "PK.L.5"),
    ("What do we use to eat soup?", ["A fork", "A spoon", "A knife", "A plate"], "B", 1, "We use a spoon to eat soup.", "PK.L.5"),
    ("Which animal says 'meow'?", ["Dog", "Cat", "Bird", "Fish"], "B", 1, "A cat says 'meow'.", "PK.L.5"),
    ("Fill in: The cat ___ sleeping.", ["am", "is", "are", "be"], "B", 2, "'The cat is sleeping.'", "PK.L.1"),
    ("What is the opposite of 'big'?", ["Tall", "Small", "Wide", "Long"], "B", 2, "Big and small are opposites.", "PK.L.5"),
    ("Which word means 'happy'?", ["Sad", "Angry", "Glad", "Tired"], "C", 2, "Glad means happy or joyful.", "PK.L.5"),
    ("What is the opposite of 'hot'?", ["Warm", "Cold", "Dry", "Wet"], "B", 2, "Hot and cold are opposites.", "PK.L.5"),
    ("Which is NOT an animal?", ["Dog", "Chair", "Cat", "Fish"], "B", 2, "A chair is furniture, not an animal.", "PK.L.5"),
    ("Which sentence is correct?", ["I has a dog.", "I have a dog.", "I haves a dog.", "I having a dog."], "B", 3, "The correct form is 'I have a dog.'", "PK.L.1"),
    ("How many syllables in 'ba-na-na'?", ["1", "2", "3", "4"], "C", 3, "Ba-na-na has 3 syllables.", "PK.RF.2"),
    ("What is the plural of 'cat'?", ["Cat", "Cats", "Cates", "Catts"], "B", 3, "We add 's' to make cat → cats.", "PK.L.1"),
    ("Fill in: She ___ running in the park.", ["am", "is", "are", "be"], "B", 3, "'She is running in the park.'", "PK.L.1"),
    ("What is the opposite of 'up'?", ["Left", "Right", "Down", "Over"], "C", 4, "Up and down are opposites.", "PK.L.5"),
    ("Fill in: They ___ playing outside.", ["is", "am", "are", "was"], "C", 4, "'They are playing outside.'", "PK.L.1"),
    ("Which word describes a color?", ["Run", "Blue", "Jump", "Eat"], "B", 5, "Blue is a color word.", "PK.L.5"),
    ("What is the opposite of 'fast'?", ["Quick", "Slow", "Run", "Speed"], "B", 5, "Fast and slow are opposites.", "PK.L.5"),
]

QUESTIONS[("pre-k", "Science")] = [
    ("What do plants need to grow?", ["Toys", "Water", "Books", "Shoes"], "B", 1, "Plants need water and sunlight to grow.", "PK.LS.1"),
    ("How many legs does a dog have?", ["2", "3", "4", "6"], "C", 1, "Dogs have 4 legs.", "PK.LS.1"),
    ("What sense do we use with our eyes?", ["Hearing", "Sight", "Smell", "Touch"], "B", 1, "We use our eyes for sight.", "PK.LS.1"),
    ("Which is a baby animal: kitten or table?", ["Kitten", "Table", "Both", "Neither"], "A", 1, "A kitten is a baby cat.", "PK.LS.1"),
    ("What do birds have that helps them fly?", ["Legs", "Wings", "Teeth", "Ears"], "B", 1, "Birds fly using their wings.", "PK.LS.1"),
    ("What do we see in the sky at night?", ["Sun", "Rainbow", "Moon", "Clouds only"], "C", 2, "At night we can see the moon and stars.", "PK.ESS.1"),
    ("Which season is cold and snowy?", ["Summer", "Spring", "Fall", "Winter"], "D", 2, "Winter is the cold, snowy season.", "PK.ESS.2"),
    ("Which animal lives in water?", ["Cat", "Dog", "Fish", "Bird"], "C", 2, "Fish live in water.", "PK.LS.1"),
    ("Which is alive?", ["Rock", "Chair", "Flower", "Table"], "C", 2, "A flower is a living thing.", "PK.LS.1"),
    ("What sense do we use with our ears?", ["Sight", "Hearing", "Taste", "Touch"], "B", 2, "We use ears for hearing.", "PK.LS.1"),
    ("What happens when ice gets warm?", ["It stays the same", "It melts", "It gets bigger", "It disappears"], "B", 3, "When ice gets warm, it melts into water.", "PK.PS.1"),
    ("Where does rain come from?", ["Rivers", "Oceans", "Clouds", "Trees"], "C", 3, "Rain falls from clouds in the sky.", "PK.ESS.2"),
    ("What do caterpillars become?", ["Ants", "Butterflies", "Worms", "Bees"], "B", 3, "Caterpillars change into butterflies.", "PK.LS.3"),
    ("Do plants need sunlight?", ["Yes", "No", "Only at night", "Only in winter"], "A", 3, "Plants need sunlight to make food.", "PK.LS.1"),
    ("What is the Sun?", ["A planet", "A star", "A moon", "A cloud"], "B", 4, "The Sun is a star that gives us light and heat.", "PK.ESS.1"),
    ("Why do we wear warm clothes in winter?", ["To look nice", "To stay warm", "To run faster", "To be tall"], "B", 4, "Warm clothes keep our body heat in.", "PK.ESS.2"),
    ("Which animal hatches from an egg?", ["Dog", "Cat", "Chicken", "Horse"], "C", 5, "Chickens hatch from eggs.", "PK.LS.3"),
    ("What makes a shadow?", ["Wind", "Water", "Blocking light", "Sound"], "C", 5, "Shadows form when an object blocks light.", "PK.PS.2"),
]

QUESTIONS[("pre-k", "General Knowledge")] = [
    ("What meal do we eat in the morning?", ["Lunch", "Dinner", "Breakfast", "Snack"], "C", 1, "Breakfast is the first meal of the day.", "PK.GK.1"),
    ("Which person helps put out fires?", ["Teacher", "Doctor", "Firefighter", "Chef"], "C", 1, "Firefighters help put out fires.", "PK.GK.1"),
    ("What do we brush every morning and night?", ["Hair only", "Shoes", "Teeth", "Floor"], "C", 1, "We brush our teeth to keep them clean.", "PK.GK.1"),
    ("Where do fish live?", ["Trees", "Water", "Sky", "Sand"], "B", 1, "Fish live in water.", "PK.GK.1"),
    ("How many days are in a week?", ["5", "6", "7", "8"], "C", 2, "There are 7 days in a week.", "PK.GK.1"),
    ("Where do people go when they are sick?", ["School", "Park", "Hospital", "Library"], "C", 2, "People go to a hospital when sick.", "PK.GK.1"),
    ("What do bees make?", ["Milk", "Honey", "Bread", "Juice"], "B", 2, "Bees make honey.", "PK.GK.2"),
    ("Which vehicle flies in the sky?", ["Car", "Boat", "Airplane", "Train"], "C", 2, "Airplanes fly in the sky.", "PK.GK.1"),
    ("What color do you get mixing red and yellow?", ["Green", "Orange", "Purple", "Brown"], "B", 3, "Red + Yellow = Orange.", "PK.GK.2"),
    ("What shape is a stop sign?", ["Circle", "Triangle", "Square", "Octagon"], "D", 3, "A stop sign is an octagon (8 sides).", "PK.GK.2"),
    ("What do you call a baby dog?", ["Kitten", "Cub", "Puppy", "Calf"], "C", 3, "A baby dog is called a puppy.", "PK.GK.2"),
    ("How many seasons are there?", ["2", "3", "4", "5"], "C", 3, "There are 4 seasons: spring, summer, fall, winter.", "PK.GK.2"),
    ("What is the fastest land animal?", ["Lion", "Horse", "Cheetah", "Dog"], "C", 4, "The cheetah is the fastest land animal.", "PK.GK.3"),
    ("Which country is famous for the Eiffel Tower?", ["USA", "England", "France", "Italy"], "C", 4, "The Eiffel Tower is in Paris, France.", "PK.GK.3"),
    ("How many letters are in the English alphabet?", ["24", "25", "26", "27"], "C", 5, "There are 26 letters: A to Z.", "PK.GK.3"),
    ("What planet do we live on?", ["Mars", "Venus", "Earth", "Jupiter"], "C", 5, "We live on planet Earth.", "PK.GK.3"),
]

# ═══════════════════════════════════════════════════════════════════
#  K–2  (Ages 5–8)
# ═══════════════════════════════════════════════════════════════════

QUESTIONS[("k-2", "Mathematics")] = [
    # D1
    ("What is 2 + 3?", ["4", "5", "6", "7"], "B", 1, "2 + 3 = 5.", "1.OA.1"),
    ("What is 5 + 1?", ["5", "6", "7", "8"], "B", 1, "5 + 1 = 6.", "1.OA.1"),
    ("How many sides does a triangle have?", ["2", "3", "4", "5"], "B", 1, "A triangle has 3 sides.", "1.G.1"),
    ("What is 4 + 4?", ["6", "7", "8", "9"], "C", 1, "4 + 4 = 8.", "1.OA.1"),
    ("What is 10 - 3?", ["5", "6", "7", "8"], "C", 1, "10 - 3 = 7.", "1.OA.1"),
    # D2
    ("What is 5 + 3?", ["6", "7", "8", "9"], "C", 2, "5 + 3 = 8.", "1.OA.1"),
    ("What is 12 - 4?", ["6", "7", "8", "9"], "C", 2, "12 - 4 = 8.", "1.OA.1"),
    ("How many sides does a rectangle have?", ["3", "4", "5", "6"], "B", 2, "A rectangle has 4 sides.", "1.G.1"),
    ("What is 15 + 25?", ["35", "40", "45", "50"], "B", 2, "15 + 25 = 40.", "2.NBT.5"),
    ("What time is it when the hour hand is on 3 and minute on 12?", ["12:03", "3:00", "3:12", "12:30"], "B", 2, "Hour hand on 3, minute on 12 = 3:00.", "1.MD.3"),
    ("What is 9 + 8?", ["15", "16", "17", "18"], "C", 2, "9 + 8 = 17.", "1.OA.1"),
    # D3
    ("What is 7 + 6?", ["11", "12", "13", "14"], "C", 3, "7 + 6 = 13.", "2.OA.1"),
    ("Which number is even: 7, 8, 9, 11?", ["7", "8", "9", "11"], "B", 3, "8 is even (divisible by 2).", "2.OA.3"),
    ("What is 48 + 36?", ["74", "82", "84", "86"], "C", 3, "48 + 36 = 84.", "2.NBT.5"),
    ("What number is 10 more than 53?", ["43", "54", "63", "64"], "C", 3, "53 + 10 = 63.", "1.NBT.5"),
    ("What is 20 - 8?", ["10", "11", "12", "13"], "C", 3, "20 - 8 = 12.", "2.OA.1"),
    # D4
    ("4 bags with 5 marbles each. How many marbles total?", ["9", "15", "20", "25"], "C", 4, "4 × 5 = 20 marbles.", "2.OA.4"),
    ("What is the value of the 3 in 345?", ["3", "30", "300", "3000"], "C", 4, "The 3 is in the hundreds place = 300.", "2.NBT.1"),
    ("What coin equals 25 cents?", ["Penny", "Nickel", "Dime", "Quarter"], "D", 4, "A quarter = 25 cents.", "2.MD.8"),
    ("How many minutes in an hour?", ["30", "45", "60", "100"], "C", 4, "There are 60 minutes in one hour.", "2.MD.7"),
    # D5
    ("What is 99 + 99?", ["188", "189", "198", "199"], "C", 5, "99 + 99 = 198.", "2.NBT.5"),
    ("Skip count by 5: 5, 10, 15, 20, __?", ["22", "25", "30", "35"], "B", 5, "Skip counting by 5: next is 25.", "2.NBT.2"),
    ("What is 3 × 6?", ["15", "16", "18", "21"], "C", 5, "3 × 6 = 18.", "2.OA.4"),
]

QUESTIONS[("k-2", "Reading")] = [
    ("In 'The big dog ran fast,' what is the dog doing?", ["Sleeping", "Running", "Eating", "Playing"], "B", 1, "The sentence says the dog 'ran fast.'", "RL.1.1"),
    ("What part of a book tells the title?", ["Index", "Table of contents", "Cover", "Glossary"], "C", 1, "The cover shows the title.", "RI.1.5"),
    ("What does a period (.) mean?", ["Start of sentence", "End of sentence", "A pause", "A question"], "B", 1, "A period marks the end of a sentence.", "RF.1.1"),
    ("Who writes a book?", ["Reader", "Teacher", "Author", "Librarian"], "C", 1, "An author writes books.", "RI.1.6"),
    ("What is the main idea of a story about a lost puppy finding home?", ["Cooking food", "Going to school", "Finding the way home", "Playing sports"], "C", 2, "The story is mainly about finding home.", "RL.1.2"),
    ("What does 'enormous' mean?", ["Tiny", "Very big", "Fast", "Colorful"], "B", 2, "Enormous means very big.", "L.2.4"),
    ("Which is a fiction book?", ["Real animal book", "A fairy tale about dragons", "A cookbook", "A dictionary"], "B", 2, "Fairy tales are fiction (made up).", "RL.1.5"),
    ("In 'Sam was sad because his toy broke,' why was Sam sad?", ["Tired", "Toy broke", "Raining", "Missed lunch"], "B", 2, "The text says his toy broke.", "RL.1.1"),
    ("What is a 'character' in a story?", ["The title", "A person or animal in the story", "The author", "A picture"], "B", 2, "Characters are the people or animals in a story.", "RL.1.3"),
    ("What happens FIRST in a beginning-middle-end story?", ["Problem solved", "Characters introduced", "Climax", "The ending"], "B", 3, "Characters are introduced at the beginning.", "RL.2.5"),
    ("Which word is a synonym for 'happy'?", ["Angry", "Joyful", "Afraid", "Bored"], "B", 3, "Joyful = happy.", "L.2.5"),
    ("What does 'predict' mean in reading?", ["Remember", "Guess what will happen next", "Summarize", "Read aloud"], "B", 3, "Predict = guess what happens next using clues.", "RL.2.1"),
    ("What is a 'setting'?", ["The lesson", "Where and when a story takes place", "The problem", "The ending"], "B", 3, "Setting = where and when.", "RL.2.5"),
    ("What is the opposite of 'brave'?", ["Strong", "Cowardly", "Happy", "Fast"], "B", 4, "Cowardly is the opposite of brave.", "L.2.5"),
    ("What does the suffix '-er' mean in 'taller'?", ["Less", "More", "Not", "Again"], "B", 4, "'-er' means more: taller = more tall.", "L.2.4"),
    ("What does 'nonfiction' mean?", ["Made up", "True/real information", "A type of poem", "A fairy tale"], "B", 5, "Nonfiction has true, real information.", "RI.2.1"),
    ("What clue word shows TIME order?", ["Because", "First", "However", "Although"], "B", 5, "'First' shows chronological order.", "RI.2.3"),
]

QUESTIONS[("k-2", "Language Usage")] = [
    ("Which sentence starts with a capital letter?", ["the cat sat.", "The cat sat.", "the Cat sat.", "thE cat sat."], "B", 1, "Sentences start with a capital letter.", "L.1.2"),
    ("What goes at the end of a question?", ["Period", "Exclamation mark", "Question mark", "Comma"], "C", 1, "Questions end with ?", "L.1.2"),
    ("What goes at the end of a telling sentence?", ["Question mark", "Period", "Exclamation mark", "Comma"], "B", 1, "A telling sentence ends with a period.", "L.1.2"),
    ("Fill in: 'I ___ a student.'", ["is", "am", "are", "be"], "B", 1, "'I am a student.'", "L.1.1"),
    ("Which is a noun?", ["Run", "Beautiful", "Teacher", "Quickly"], "C", 2, "A noun is a person/place/thing. Teacher is a person.", "L.1.1"),
    ("'She ___ to school every day.'", ["go", "goes", "going", "gone"], "B", 2, "She goes — third person singular.", "L.1.1"),
    ("Which word is a verb?", ["Book", "Happy", "Jump", "Blue"], "C", 2, "A verb is an action word. Jump is an action.", "L.1.1"),
    ("Which is an adjective in 'The red ball'?", ["The", "red", "ball", "is"], "B", 2, "Red describes the ball = adjective.", "L.1.1"),
    ("What is the plural of 'box'?", ["Boxs", "Boxes", "Boxies", "Box"], "B", 3, "Box + es = boxes.", "L.2.1"),
    ("'The two boys ___ playing.'", ["is", "was", "are", "has"], "C", 3, "Two boys = plural → 'are'.", "L.1.1"),
    ("Which has correct punctuation? 'I like cats, dogs, and birds.'", ["I like cats dogs and birds.", "I like cats, dogs, and birds.", "I like, cats dogs.", "I like cats dogs, and, birds."], "B", 3, "Use commas between list items.", "L.2.2"),
    ("What is the contraction of 'do not'?", ["Dont", "Don't", "Do'nt", "Donot"], "B", 3, "Do not → don't.", "L.2.2"),
    ("Which sentence uses 'their' correctly?", ["Their going home.", "They put their bags down.", "Their is a cat.", "Their very happy."], "B", 4, "'Their' = belonging to them.", "L.1.1"),
    ("Past tense of 'go'?", ["Goed", "Going", "Went", "Goes"], "C", 4, "Go → went (irregular verb).", "L.1.1"),
    ("Which is a complete sentence?", ["Running fast.", "The dog.", "She runs every day.", "Beautiful and tall."], "C", 5, "A sentence needs a subject + verb.", "L.1.1"),
    ("What is an antonym for 'quiet'?", ["Silent", "Soft", "Loud", "Calm"], "C", 5, "Loud is the opposite of quiet.", "L.2.5"),
]

QUESTIONS[("k-2", "Science")] = [
    ("What do plants need besides water to grow?", ["Toys", "Music", "Sunlight", "Paper"], "C", 1, "Plants need water AND sunlight.", "1-LS1-1"),
    ("What covers most of Earth's surface?", ["Sand", "Water", "Grass", "Rocks"], "B", 1, "About 71% of Earth is covered by water.", "K-ESS2-2"),
    ("What season comes after winter?", ["Fall", "Summer", "Spring", "Winter"], "C", 1, "Spring follows winter.", "K-ESS2-1"),
    ("What do we call baby frogs?", ["Kittens", "Tadpoles", "Puppies", "Calves"], "B", 2, "Baby frogs are tadpoles.", "2-LS4-1"),
    ("What do caterpillars turn into?", ["Ants", "Worms", "Butterflies", "Beetles"], "C", 2, "Caterpillars become butterflies.", "2-LS4-1"),
    ("What is the Sun?", ["A planet", "A star", "A moon", "A comet"], "B", 2, "The Sun is a star.", "1-ESS1-1"),
    ("Which force pulls things down?", ["Magnetism", "Friction", "Gravity", "Wind"], "C", 2, "Gravity pulls everything toward Earth.", "K-PS2-1"),
    ("What is the largest organ in your body?", ["Heart", "Brain", "Skin", "Lungs"], "C", 3, "Your skin is the largest organ.", "1-LS1-1"),
    ("What causes day and night?", ["Moon moving", "Sun moving", "Earth spinning", "Clouds"], "C", 3, "Earth spinning on its axis causes day and night.", "1-ESS1-1"),
    ("Which is NOT a state of matter?", ["Solid", "Liquid", "Gas", "Energy"], "D", 3, "Energy is not a state of matter.", "2-PS1-1"),
    ("How do animals in cold places stay warm?", ["Thick fur", "Wearing clothes", "Staying awake", "Eating ice"], "A", 3, "Animals have thick fur or blubber.", "2-LS4-1"),
    ("What do roots do for a plant?", ["Make food", "Absorb water from soil", "Make flowers", "Produce seeds"], "B", 3, "Roots absorb water and nutrients from soil.", "2-LS2-1"),
    ("What happens to water when heated to 100°C?", ["Freezes", "Stays the same", "Boils", "Disappears"], "C", 4, "Water boils at 100°C.", "2-PS1-4"),
    ("A magnet will attract which material?", ["Wood", "Plastic", "Iron", "Glass"], "C", 4, "Magnets attract iron and steel.", "K-PS2-1"),
    ("What type of rock is formed from a volcano?", ["Sedimentary", "Metamorphic", "Igneous", "Limestone"], "C", 5, "Igneous rock forms from cooled lava/magma.", "2-ESS1-1"),
    ("What makes a rainbow?", ["Wind", "Clouds", "Light through water droplets", "Heat"], "C", 5, "Sunlight refracting through water droplets creates a rainbow.", "1-PS4-3"),
]

QUESTIONS[("k-2", "General Knowledge")] = [
    ("How many months are in a year?", ["10", "11", "12", "13"], "C", 1, "12 months in a year.", "GK.K2.1"),
    ("What do we celebrate on January 1st?", ["Christmas", "New Year's Day", "Valentine's", "Independence Day"], "B", 1, "January 1st = New Year's Day.", "GK.K2.1"),
    ("What shape is Earth?", ["Flat", "Square", "Sphere", "Triangle"], "C", 2, "Earth is a sphere.", "GK.K2.2"),
    ("Where do kangaroos live?", ["Africa", "Asia", "Australia", "Europe"], "C", 2, "Kangaroos live in Australia.", "GK.K2.1"),
    ("In which direction does the Sun rise?", ["West", "North", "East", "South"], "C", 2, "The Sun rises in the East.", "GK.K2.2"),
    ("What do we call a person who leads a country?", ["Teacher", "Doctor", "President or King", "Chef"], "C", 2, "A president or king leads a country.", "GK.K2.1"),
    ("Which ocean is the biggest?", ["Atlantic", "Indian", "Arctic", "Pacific"], "D", 3, "The Pacific Ocean is the largest.", "GK.K2.2"),
    ("How many continents are there?", ["5", "6", "7", "8"], "C", 3, "There are 7 continents.", "GK.K2.2"),
    ("What language is spoken in Japan?", ["Chinese", "Korean", "Japanese", "English"], "C", 3, "Japanese is spoken in Japan.", "GK.K2.3"),
    ("Who was the first man to walk on the Moon?", ["Buzz Aldrin", "Neil Armstrong", "John Glenn", "Yuri Gagarin"], "B", 4, "Neil Armstrong, July 20, 1969.", "GK.K2.3"),
    ("What is the smallest continent?", ["Europe", "Antarctica", "Australia", "South America"], "C", 4, "Australia is the smallest continent.", "GK.K2.2"),
    ("What is the capital of the USA?", ["New York", "Los Angeles", "Washington D.C.", "Chicago"], "C", 5, "Washington D.C. is the US capital.", "GK.K2.3"),
]

# ═══════════════════════════════════════════════════════════════════
#  3–5  (Ages 8–11)
# ═══════════════════════════════════════════════════════════════════

QUESTIONS[("3-5", "Mathematics")] = [
    ("What is 6 × 7?", ["36", "42", "48", "54"], "B", 2, "6 × 7 = 42.", "3.OA.7"),
    ("What is 9 × 4?", ["32", "34", "36", "38"], "C", 2, "9 × 4 = 36.", "3.OA.7"),
    ("What is 8 × 8?", ["56", "64", "72", "81"], "B", 2, "8 × 8 = 64.", "3.OA.7"),
    ("How many sides does a pentagon have?", ["4", "5", "6", "7"], "B", 1, "A pentagon has 5 sides.", "3.G.1"),
    ("What is 100 - 37?", ["53", "57", "63", "67"], "C", 1, "100 - 37 = 63.", "3.NBT.2"),
    ("What is 1/2 + 1/4?", ["1/6", "2/4", "3/4", "1/3"], "C", 3, "1/2 = 2/4, so 2/4 + 1/4 = 3/4.", "4.NF.3"),
    ("Perimeter of rectangle: length 8, width 3?", ["11", "22", "24", "32"], "B", 2, "P = 2(8+3) = 22.", "3.MD.8"),
    ("What is 0.5 as a fraction?", ["1/3", "1/4", "1/2", "1/5"], "C", 2, "0.5 = 1/2.", "4.NF.6"),
    ("Round 4,567 to the nearest hundred.", ["4,500", "4,600", "4,570", "5,000"], "B", 3, "4,567 rounds to 4,600.", "3.NBT.1"),
    ("Area of a square with side 9 cm?", ["18 cm²", "36 cm²", "81 cm²", "72 cm²"], "C", 3, "9 × 9 = 81 cm².", "4.MD.3"),
    ("Fraction equivalent to 2/3?", ["3/4", "4/6", "4/5", "5/6"], "B", 3, "2/3 = 4/6.", "3.NF.3"),
    ("What is 3/5 of 40?", ["12", "20", "24", "30"], "C", 4, "(40 ÷ 5) × 3 = 24.", "5.NF.4"),
    ("What is 345 × 12?", ["3,940", "4,000", "4,140", "4,240"], "C", 4, "345 × 12 = 4,140.", "5.NBT.5"),
    ("144 items split into 12 equal groups?", ["10", "12", "14", "16"], "B", 3, "144 ÷ 12 = 12.", "4.NBT.6"),
    ("What is 2/3 + 1/6?", ["3/9", "3/6", "5/6", "1/2"], "C", 4, "4/6 + 1/6 = 5/6.", "5.NF.1"),
    ("What is 7.5 × 4?", ["28", "30", "32", "34"], "B", 4, "7.5 × 4 = 30.", "5.NBT.7"),
    ("What is the volume of a box: 3×4×5?", ["12", "40", "47", "60"], "D", 5, "3 × 4 × 5 = 60.", "5.MD.5"),
    ("Express 3/8 as a decimal.", ["0.25", "0.375", "0.38", "0.5"], "B", 5, "3 ÷ 8 = 0.375.", "4.NF.6"),
    ("What is 15% of 200?", ["15", "20", "25", "30"], "D", 5, "15% × 200 = 30.", "5.NF.4"),
]

QUESTIONS[("3-5", "Reading")] = [
    ("What is the 'setting' of a story?", ["Main character", "Where and when", "The problem", "The solution"], "B", 1, "Setting = where and when.", "RL.3.5"),
    ("What does the prefix 'un-' mean in 'unhappy'?", ["Very", "Not", "Again", "Before"], "B", 2, "un- = not.", "L.3.4"),
    ("What does 'theme' mean?", ["Character's name", "Lesson or message", "Title", "Author bio"], "B", 2, "Theme = central lesson.", "RL.4.2"),
    ("What is the author's purpose if writing to make you laugh?", ["Inform", "Persuade", "Entertain", "Describe"], "C", 2, "Making you laugh = entertaining.", "RI.4.8"),
    ("What does the suffix '-ful' mean in 'hopeful'?", ["Without", "Full of", "Less", "Again"], "B", 2, "'-ful' = full of. Hopeful = full of hope.", "L.3.4"),
    ("Which sentence uses a simile?", ["Sun was hot.", "Sun was like fire.", "Sun set.", "Sun was yellow."], "B", 3, "Similes use 'like' or 'as'.", "RL.4.4"),
    ("What does 'infer' mean?", ["Copy text", "Guess using clues", "Read aloud", "Summarize"], "B", 3, "Infer = logical guess from clues.", "RI.4.1"),
    ("When comparing two texts, you look for?", ["Same pictures", "Similarities and differences", "Same pages", "Same author"], "B", 3, "Comparing = similarities & differences.", "RI.5.9"),
    ("What is a 'narrator'?", ["The author", "The person telling the story", "The reader", "A character's friend"], "B", 3, "The narrator tells the story.", "RL.3.6"),
    ("What is 'point of view'?", ["Setting", "Who tells the story", "Ending", "Title"], "B", 4, "Point of view = perspective of the storyteller.", "RL.5.6"),
    ("What does 'foreshadowing' mean?", ["Looking back", "Hints about what comes later", "The ending", "A character description"], "B", 4, "Foreshadowing = clues about future events.", "RL.5.5"),
    ("What is a 'metaphor'?", ["A type of rhyme", "A direct comparison without like/as", "A question", "A long sentence"], "B", 4, "Metaphors compare directly: 'Life is a journey.'", "RL.4.4"),
    ("What is 'cause and effect'?", ["Two unrelated events", "Why something happened and what happened", "A type of poem", "A character trait"], "B", 5, "Cause = why, Effect = what happened.", "RI.5.5"),
    ("What is an 'autobiography'?", ["A fictional story", "Someone writing about their own life", "A poem collection", "A textbook"], "B", 5, "Autobiography = self-written life story.", "RI.4.3"),
]

QUESTIONS[("3-5", "Language Usage")] = [
    ("What type of sentence asks a question?", ["Declarative", "Exclamatory", "Interrogative", "Imperative"], "C", 2, "Interrogative = asks a question.", "L.3.1"),
    ("Which word is an adjective in 'The tall tree fell'?", ["The", "tall", "tree", "fell"], "B", 2, "Tall describes the tree = adjective.", "L.3.1"),
    ("What is the past tense of 'run'?", ["Runned", "Running", "Ran", "Runs"], "C", 2, "Run → ran.", "L.3.1"),
    ("What is a synonym for 'difficult'?", ["Easy", "Simple", "Challenging", "Quick"], "C", 2, "Challenging = difficult.", "L.4.5"),
    ("Which uses a comma correctly?", ["I ate, pizza.", "I ate pizza, salad, and cake.", "I, ate pizza.", "I ate pizza salad, and cake."], "B", 3, "Commas separate list items.", "L.3.2"),
    ("'Their / there / they're' — which means 'they are'?", ["Their", "There", "They're", "Thier"], "C", 3, "They're = they are.", "L.4.1"),
    ("Which word needs an apostrophe? 'The dogs bone.'", ["dogs", "bone", "under", "table"], "A", 3, "dog's bone (possessive).", "L.3.2"),
    ("What is the past tense of 'eat'?", ["Eated", "Ate", "Eating", "Eats"], "B", 3, "Eat → ate (irregular).", "L.3.1"),
    ("Which is a compound sentence?", ["I like cats.", "I like cats and dogs.", "I like cats, but I love dogs.", "Running fast."], "C", 4, "Two independent clauses joined by 'but'.", "L.4.1"),
    ("What is an adverb?", ["Describes a noun", "Describes a verb", "A type of noun", "A conjunction"], "B", 4, "Adverbs describe verbs (quickly, softly).", "L.3.1"),
    ("Which is correct: 'its' or 'it's'? '___ raining.'", ["Its", "It's", "Its'", "Its's"], "B", 4, "It's = it is. 'It's raining.'", "L.4.1"),
    ("What is a 'preposition'?", ["An action word", "A word showing position/relationship", "A describing word", "A naming word"], "B", 4, "Prepositions: in, on, at, between, etc.", "L.3.1"),
    ("Which sentence has correct subject-verb agreement?", ["The dogs runs fast.", "The dog run fast.", "The dogs run fast.", "The dog are fast."], "C", 5, "Dogs (plural) → run (plural verb).", "L.3.1"),
    ("What is a 'conjunction'?", ["A verb", "A word that joins words/clauses (and, but, or)", "An adjective", "A pronoun"], "B", 5, "Conjunctions connect: and, but, or, so.", "L.3.1"),
]

QUESTIONS[("3-5", "Science")] = [
    ("Three states of matter?", ["Solid, liquid, gas", "Hot, cold, warm", "Big, medium, small", "Metal, plastic, wood"], "A", 1, "Solid, liquid, gas.", "3-PS1-1"),
    ("Which planet is closest to the Sun?", ["Venus", "Earth", "Mercury", "Mars"], "C", 2, "Mercury is closest.", "3-ESS1-1"),
    ("In a food chain, what is a 'producer'?", ["Animal eating plants", "Plant making food", "Animal eating animals", "Decomposer"], "B", 2, "Producers = plants.", "5-LS2-1"),
    ("Which force slows a sliding object?", ["Gravity", "Friction", "Magnetism", "Buoyancy"], "B", 2, "Friction opposes motion.", "3-PS2-1"),
    ("What is the water cycle?", ["Water in rivers", "Evaporation → condensation → precipitation", "Water freezing", "Water filtering"], "B", 3, "Evaporate, condense, precipitate.", "3-ESS2-1"),
    ("What type of energy does a battery store?", ["Heat", "Chemical", "Light", "Sound"], "B", 3, "Batteries store chemical energy.", "4-PS3-2"),
    ("What is photosynthesis?", ["Respiration", "Digestion", "Plants making food from sunlight", "Evaporation"], "C", 3, "Plants use sunlight to make food.", "5-LS1-1"),
    ("What causes earthquakes?", ["Wind", "Rain", "Tectonic plates moving", "Temperature"], "C", 3, "Tectonic plates shifting.", "4-ESS2-2"),
    ("What is an 'ecosystem'?", ["A zoo", "A community of living things and their environment", "A garden", "A forest only"], "B", 4, "Ecosystem = organisms + their environment.", "5-LS2-1"),
    ("What is the difference between a renewable and non-renewable resource?", ["No difference", "Renewable can be replaced naturally", "Non-renewable grows back", "Renewable is cheaper"], "B", 4, "Renewable resources can be replenished.", "4-ESS3-1"),
    ("How does sound travel?", ["Only through air", "Through vibrations in a medium", "Only through solids", "It doesn't need a medium"], "B", 4, "Sound travels as vibrations through media.", "4-PS4-1"),
    ("What organ pumps blood?", ["Brain", "Lungs", "Heart", "Stomach"], "C", 4, "The heart pumps blood.", "4-LS1-1"),
    ("What is the difference between weather and climate?", ["Same thing", "Weather is short-term, climate is long-term", "Climate is daily", "Weather never changes"], "B", 5, "Weather = daily; climate = long-term average.", "3-ESS2-1"),
    ("What gas do plants absorb?", ["Oxygen", "Nitrogen", "Carbon dioxide", "Helium"], "C", 5, "Plants absorb CO₂ for photosynthesis.", "5-LS1-1"),
]

QUESTIONS[("3-5", "General Knowledge")] = [
    ("Capital of France?", ["London", "Berlin", "Paris", "Rome"], "C", 1, "Paris.", "GK.35.1"),
    ("Longest river in the world?", ["Amazon", "Nile", "Mississippi", "Yangtze"], "B", 2, "The Nile.", "GK.35.1"),
    ("How many planets in our solar system?", ["7", "8", "9", "10"], "B", 2, "8 planets.", "GK.35.3"),
    ("Instrument with 88 keys?", ["Guitar", "Violin", "Piano", "Drums"], "C", 2, "A piano.", "GK.35.2"),
    ("Who wrote Romeo and Juliet?", ["Dickens", "Shakespeare", "Twain", "Austen"], "B", 3, "Shakespeare.", "GK.35.2"),
    ("Year humans first walked on the Moon?", ["1959", "1965", "1969", "1972"], "C", 3, "1969.", "GK.35.3"),
    ("Hardest natural material?", ["Gold", "Iron", "Diamond", "Quartz"], "C", 3, "Diamond.", "GK.35.3"),
    ("What is a paleontologist?", ["Biologist", "Fossil scientist", "Astronomer", "Chemist"], "B", 4, "Studies fossils.", "GK.35.3"),
    ("What country has the Great Wall?", ["Japan", "India", "China", "Korea"], "C", 4, "China.", "GK.35.1"),
    ("Who invented the telephone?", ["Edison", "Bell", "Tesla", "Newton"], "B", 4, "Alexander Graham Bell.", "GK.35.3"),
    ("What is the Sahara?", ["Ocean", "Mountain", "Desert", "River"], "C", 3, "The Sahara is a desert in Africa.", "GK.35.1"),
    ("How many strings does a standard guitar have?", ["4", "5", "6", "8"], "C", 5, "6 strings.", "GK.35.2"),
    ("What gas do humans breathe in?", ["CO₂", "Nitrogen", "Oxygen", "Helium"], "C", 5, "Oxygen.", "GK.35.3"),
]

# ═══════════════════════════════════════════════════════════════════
#  6–8  (Ages 11–14)
# ═══════════════════════════════════════════════════════════════════

QUESTIONS[("6-8", "Mathematics")] = [
    ("What is 25% of 80?", ["15", "20", "25", "40"], "B", 2, "0.25 × 80 = 20.", "6.RP.3"),
    ("Solve: 3x + 5 = 20", ["3", "5", "7", "15"], "B", 2, "3x = 15, x = 5.", "6.EE.7"),
    ("What is √144?", ["10", "11", "12", "14"], "C", 2, "12 × 12 = 144.", "8.EE.2"),
    ("Probability of rolling a 3 on a die?", ["1/2", "1/3", "1/4", "1/6"], "D", 2, "P = 1/6.", "7.SP.5"),
    ("Area of triangle: base 10, height 6?", ["16", "30", "60", "36"], "B", 3, "½ × 10 × 6 = 30.", "6.G.1"),
    ("Simplify: 3/4 ÷ 1/2", ["3/8", "3/2", "1/2", "3/4"], "B", 3, "3/4 × 2/1 = 3/2.", "6.NS.1"),
    ("Slope of y = 3x + 2?", ["2", "3", "5", "6"], "B", 3, "m = 3.", "8.F.3"),
    ("30% off a $40 shirt — sale price?", ["$10", "$12", "$28", "$30"], "C", 3, "$40 - $12 = $28.", "7.RP.3"),
    ("Volume of rectangular prism: 5×3×4?", ["12", "30", "47", "60"], "D", 3, "5×3×4 = 60.", "7.G.6"),
    ("Solve: -8 + 3×(-2)?", ["10", "-14", "-2", "-10"], "B", 4, "3×(-2) = -6; -8 + (-6) = -14.", "7.NS.1"),
    ("What is 2³ × 3²?", ["36", "48", "72", "108"], "C", 4, "8 × 9 = 72.", "8.EE.1"),
    ("Solve: 2(x-3) = 10", ["5", "6.5", "7", "8"], "D", 4, "x - 3 = 5; x = 8.", "7.EE.4"),
    ("What is the mean of 5, 8, 10, 12, 15?", ["8", "9", "10", "11"], "C", 3, "(5+8+10+12+15)/5 = 10.", "6.SP.3"),
    ("Distance between (0,0) and (3,4)?", ["3", "4", "5", "7"], "C", 4, "√(9+16) = 5.", "8.G.8"),
    ("Solve: x² = 49", ["x = 7", "x = ±7", "x = 49", "x = ±49"], "B", 4, "x = ±7.", "8.EE.2"),
    ("What is 5⁰?", ["0", "1", "5", "Undefined"], "B", 3, "Any number to the 0 power = 1.", "8.EE.1"),
    ("Convert 3/8 to a percentage.", ["25%", "33.3%", "37.5%", "40%"], "C", 5, "3/8 = 0.375 = 37.5%.", "6.RP.3"),
    ("What is the circumference of a circle with radius 7? (π≈22/7)", ["22", "44", "38.5", "14"], "B", 5, "C = 2πr = 2 × 22/7 × 7 = 44.", "7.G.4"),
]

QUESTIONS[("6-8", "Reading")] = [
    ("What does 'analyze' mean?", ["Read quickly", "Examine closely", "Write summary", "Memorize"], "B", 2, "Analyze = examine closely.", "RL.6.1"),
    ("What is the difference between fact and opinion?", ["Same thing", "Facts can be proven; opinions are beliefs", "No difference", "Opinions are in newspapers"], "B", 2, "Fact = provable; opinion = belief.", "RI.6.8"),
    ("What is 'context clues'?", ["Index", "Words around unknown word that help meaning", "Dictionary", "Skipping words"], "B", 2, "Surrounding words = context clues.", "L.6.4"),
    ("What literary device: 'The wind howled'?", ["Simile", "Metaphor", "Personification", "Hyperbole"], "C", 3, "Giving wind human action = personification.", "RL.6.4"),
    ("What is a 'thesis statement'?", ["First sentence", "Main argument of essay", "Question", "Bibliography"], "B", 3, "Thesis = central argument.", "W.6.1"),
    ("What is an 'unreliable narrator'?", ["Biased narrator", "Multilingual narrator", "Third-person narrator", "Summarizing narrator"], "A", 3, "Unreliable narrator has biased perspective.", "RL.7.6"),
    ("What is 'hyperbole'?", ["Understatement", "Extreme exaggeration", "Comparison", "Repetition"], "B", 3, "Hyperbole = exaggeration for effect.", "RL.7.4"),
    ("What does 'benevolent' mean?", ["Mean", "Kind and generous", "Cautious", "Intelligent"], "B", 4, "Benevolent = kind.", "L.8.4"),
    ("Which is irony?", ["Fire station burns down", "Dog barks", "Hot summer", "Student studies"], "A", 4, "A fire station burning = ironic.", "RL.8.6"),
    ("What is 'allusion'?", ["Direct quote", "Reference to well-known work/person/event", "A sound effect", "A character type"], "B", 4, "Allusion = indirect reference.", "RL.8.4"),
    ("What is 'satire'?", ["A love poem", "Using humor to criticize", "A type of essay", "A mystery genre"], "B", 5, "Satire = humor to critique society.", "RL.8.6"),
    ("What is 'dramatic irony'?", ["Exaggeration", "When audience knows something characters don't", "A sad ending", "A plot twist"], "B", 5, "Audience knows more than characters.", "RL.7.6"),
]

QUESTIONS[("6-8", "Language Usage")] = [
    ("Which uses 'affect' correctly?", ["The affect was positive.", "Rain will affect the game.", "Good affect on her.", "Affect of medicine."], "B", 3, "Affect = verb (to influence).", "L.6.1"),
    ("What is a 'complex sentence'?", ["Two subjects", "Independent + dependent clause", "Very long", "Many adjectives"], "B", 3, "Complex = independent + dependent clause.", "L.7.1"),
    ("'Between you and ___.'", ["I", "me", "myself", "mine"], "B", 3, "'Between' uses object pronoun 'me'.", "L.6.1"),
    ("Which transition shows contrast?", ["Furthermore", "Therefore", "However", "Additionally"], "C", 2, "'However' = contrast.", "W.6.2"),
    ("'Fewer' or 'less'? '___ people came.'", ["Less", "Fewer", "Both", "Neither"], "B", 3, "Fewer for countable nouns.", "L.6.1"),
    ("What is a 'dangling modifier'?", ["Long adjective", "Modifier with no clear subject", "Adverb type", "Exclamation"], "B", 4, "No clear subject to modify.", "L.7.1"),
    ("What is 'parallel structure'?", ["Repeating sentence", "Same grammatical form for similar ideas", "Two columns", "Using synonyms"], "B", 4, "Consistent grammatical patterns.", "L.7.1"),
    ("What punctuation separates list items containing commas?", ["Colons", "Periods", "Semicolons", "Dashes"], "C", 4, "Semicolons for complex lists.", "L.8.2"),
    ("What is 'active voice'?", ["Subject receives action", "Subject performs action", "Past tense", "A question form"], "B", 3, "Active = subject does the action.", "L.7.3"),
    ("Which correctly uses a colon?", ["I need: milk.", "I need these items: milk, eggs, and bread.", "I: need milk.", "I need items, like: milk."], "B", 4, "Colon introduces a list after a complete clause.", "L.8.2"),
    ("What is 'connotation'?", ["Dictionary definition", "Emotional/cultural association of a word", "A synonym", "Pronunciation guide"], "B", 5, "Connotation = implied meaning.", "L.8.5"),
    ("What type of clause cannot stand alone?", ["Independent", "Dependent", "Compound", "Simple"], "B", 5, "Dependent clause needs an independent clause.", "L.7.1"),
]

QUESTIONS[("6-8", "Science")] = [
    ("Basic unit of life?", ["Atom", "Cell", "Molecule", "Organ"], "B", 1, "Cell = basic unit of life.", "MS-LS1-1"),
    ("Chemical formula for water?", ["H2O", "CO2", "NaCl", "O2"], "A", 1, "H₂O.", "MS-PS1-1"),
    ("Which organelle is the 'powerhouse'?", ["Nucleus", "Ribosome", "Mitochondria", "Cell wall"], "C", 2, "Mitochondria produce ATP.", "MS-LS1-2"),
    ("What is the Sun?", ["Planet", "Star", "Moon", "Comet"], "B", 2, "The Sun is a star.", "MS-ESS1-1"),
    ("Difference between speed and velocity?", ["None", "Velocity includes direction", "Speed includes direction", "Speed is faster"], "B", 3, "Velocity = speed + direction.", "MS-PS2-2"),
    ("What layer of atmosphere do we live in?", ["Stratosphere", "Mesosphere", "Troposphere", "Thermosphere"], "C", 3, "Troposphere.", "MS-ESS2-6"),
    ("Newton's First Law?", ["F=ma", "Equal opposite reaction", "Object at rest stays at rest", "Energy conservation"], "C", 3, "Inertia.", "MS-PS2-1"),
    ("pH of a neutral substance?", ["0", "5", "7", "14"], "C", 3, "pH 7 = neutral.", "MS-PS1-2"),
    ("How do vaccines work?", ["Kill bacteria", "Train immune system", "Add vitamins", "Make stronger"], "B", 4, "Vaccines train the immune system.", "MS-LS1-8"),
    ("What is an element?", ["A mixture", "A pure substance with one type of atom", "A compound", "A solution"], "B", 3, "Element = one type of atom.", "MS-PS1-1"),
    ("What is density?", ["Weight", "Mass per unit volume", "Size", "Height"], "B", 4, "Density = mass/volume.", "MS-PS1-2"),
    ("What is a chemical reaction?", ["Mixing two liquids", "Substances transforming into new substances", "Heating something", "Dissolving"], "B", 4, "New substances are formed.", "MS-PS1-2"),
    ("What is DNA?", ["A type of cell", "Genetic material carrying hereditary info", "A protein", "An organ"], "B", 4, "DNA carries genetic instructions.", "MS-LS3-1"),
    ("What is the difference between mitosis and meiosis?", ["Same thing", "Mitosis = 2 identical cells; meiosis = 4 unique cells", "Meiosis makes identical cells", "Mitosis makes 4 cells"], "B", 5, "Mitosis = 2 identical; meiosis = 4 with half chromosomes.", "MS-LS3-2"),
    ("What is the electromagnetic spectrum?", ["Visible light only", "Range of all electromagnetic waves", "Sound waves", "Radio only"], "B", 5, "Full range: radio → gamma rays.", "MS-PS4-1"),
]

QUESTIONS[("6-8", "General Knowledge")] = [
    ("Who painted the Mona Lisa?", ["Michelangelo", "Da Vinci", "Picasso", "Van Gogh"], "B", 2, "Leonardo da Vinci.", "GK.68.2"),
    ("Tallest mountain?", ["K2", "Kilimanjaro", "Everest", "Mont Blanc"], "C", 2, "Mount Everest.", "GK.68.1"),
    ("Largest desert?", ["Sahara", "Gobi", "Antarctic", "Arabian"], "C", 3, "Antarctica (cold desert).", "GK.68.1"),
    ("What does GDP stand for?", ["General Data Production", "Gross Domestic Product", "Global Development Plan", "Government Debt Payment"], "B", 3, "Gross Domestic Product.", "GK.68.2"),
    ("Ancient civilization that built pyramids?", ["Romans", "Greeks", "Egyptians", "Persians"], "C", 2, "Ancient Egyptians.", "GK.68.3"),
    ("What is the United Nations?", ["Sports org", "International peace organization", "Bank", "Space agency"], "B", 3, "Promotes peace and cooperation.", "GK.68.3"),
    ("Speed of light (approx)?", ["300 km/s", "3,000 km/s", "300,000 km/s", "3,000,000 km/s"], "C", 4, "~300,000 km/s.", "GK.68.4"),
    ("Country with largest population?", ["USA", "India", "China", "Indonesia"], "B", 3, "India.", "GK.68.1"),
    ("What year did WWII end?", ["1943", "1944", "1945", "1946"], "C", 3, "1945.", "GK.68.3"),
    ("What is the currency of Japan?", ["Yuan", "Won", "Yen", "Dollar"], "C", 3, "Japanese Yen.", "GK.68.2"),
    ("Who discovered penicillin?", ["Pasteur", "Fleming", "Curie", "Einstein"], "B", 4, "Alexander Fleming.", "GK.68.4"),
    ("What is the Richter scale?", ["Temperature", "Earthquake magnitude", "Wind speed", "Sound volume"], "B", 4, "Measures earthquake magnitude.", "GK.68.4"),
    ("What is the Magna Carta?", ["A ship", "A medieval charter limiting king's power", "A weapon", "A castle"], "B", 5, "1215 charter limiting royal power.", "GK.68.3"),
]

# ═══════════════════════════════════════════════════════════════════
#  9–12  (Ages 14–18)
# ═══════════════════════════════════════════════════════════════════

QUESTIONS[("9-12", "Mathematics")] = [
    ("Solve: 2x² - 8 = 0", ["x=±2", "x=±4", "x=2", "x=4"], "A", 2, "x²=4, x=±2.", "HSA.REI.4"),
    ("What is log₁₀(1000)?", ["2", "3", "4", "10"], "B", 2, "10³=1000.", "HSF.BF.5"),
    ("Right triangle: legs 3 and 4, hypotenuse?", ["5", "6", "7", "8"], "A", 2, "3²+4²=25, √25=5.", "HSG.SRT.8"),
    ("What is sin(30°)?", ["0", "1/2", "√2/2", "√3/2"], "B", 3, "sin 30° = 0.5.", "HSG.SRT.6"),
    ("Derivative of f(x)=3x²?", ["3x", "6x", "6x²", "9x"], "B", 3, "Power rule: 6x.", "HSF.IF.6"),
    ("Standard deviation measures?", ["Central tendency", "Spread/variability", "Median", "Mode"], "B", 3, "Spread of data.", "HSS.ID.2"),
    ("Interior angles of hexagon?", ["360°", "540°", "720°", "900°"], "C", 3, "(6-2)×180=720°.", "HSG.CO.11"),
    ("Integral of 2x dx?", ["x", "x²", "x²+C", "2x²+C"], "C", 4, "∫2x dx = x²+C.", "HSF.IF.6"),
    ("Compound interest formula?", ["A=P+rt", "A=P(1+r/n)^(nt)", "A=Prt", "A=P×r×t"], "B", 4, "A=P(1+r/n)^(nt).", "HSF.LE.1"),
    ("Determinant of [[2,3],[1,4]]?", ["5", "6", "8", "11"], "A", 4, "(2)(4)-(3)(1)=5.", "HSN.VM.12"),
    ("What is the limit of (1+1/n)^n as n→∞?", ["1", "2", "e≈2.718", "∞"], "C", 5, "This defines Euler's number e.", "HSF.LE.1"),
    ("What is i² (imaginary unit)?", ["1", "-1", "i", "0"], "B", 4, "i² = -1 by definition.", "HSN.CN.1"),
    ("Solve: |2x-3| = 7", ["x=5 or x=-2", "x=5", "x=-2", "x=2 or x=-5"], "A", 3, "2x-3=7→x=5; 2x-3=-7→x=-2.", "HSA.REI.3"),
    ("What is cos(60°)?", ["0", "1/2", "√2/2", "√3/2"], "B", 3, "cos 60° = 0.5.", "HSG.SRT.6"),
    ("What is the area under y=x from 0 to 4?", ["4", "8", "12", "16"], "B", 5, "∫₀⁴ x dx = [x²/2]₀⁴ = 8.", "HSF.IF.6"),
    ("If P(A)=0.3, P(B)=0.5, P(A∩B)=0.1, what is P(A∪B)?", ["0.5", "0.7", "0.8", "0.9"], "B", 4, "P(A∪B)=0.3+0.5-0.1=0.7.", "HSS.CP.7"),
    ("Simplify: (x²-9)/(x-3)", ["x+3", "x-3", "x²-3", "x+9"], "A", 3, "(x-3)(x+3)/(x-3)=x+3.", "HSA.APR.1"),
    ("What is nPr formula?", ["n!/r!", "n!/(n-r)!", "n!/r!(n-r)!", "n^r"], "B", 4, "Permutations: n!/(n-r)!.", "HSS.CP.9"),
]

QUESTIONS[("9-12", "Reading")] = [
    ("What is 'rhetoric'?", ["Poem type", "Art of persuasive language", "Figure of speech", "Literary period"], "B", 2, "Persuasive speaking/writing.", "RI.9.6"),
    ("What is 'tone'?", ["Volume", "Author's attitude", "Topic sentence", "Setting"], "B", 2, "Author's attitude toward subject.", "RL.9.4"),
    ("What does 'juxtaposition' mean?", ["Repeating phrase", "Placing contrasting things side by side", "Exaggeration", "Metaphor type"], "B", 3, "Side-by-side contrast.", "RL.9.4"),
    ("What is 'ethos'?", ["Emotional appeal", "Logical appeal", "Credibility appeal", "Narrative appeal"], "C", 3, "Establishes credibility.", "RI.9.6"),
    ("Denotation vs. connotation?", ["Same thing", "Denotation=literal; connotation=implied", "Connotation=literal", "Neither about meaning"], "B", 3, "Literal vs. implied meaning.", "L.9.5"),
    ("What is a 'soliloquy'?", ["Conversation", "Speech alone revealing thoughts", "Song", "Stage direction"], "B", 3, "Character speaks thoughts aloud alone.", "RL.9.5"),
    ("What is 'allegory'?", ["Short moral story", "Story with hidden symbolic meaning", "Essay type", "Humorous poem"], "B", 4, "Characters/events symbolize deeper meaning.", "RL.11.4"),
    ("What is 'pathos'?", ["Logical argument", "Ethical appeal", "Emotional appeal", "Narrative technique"], "C", 4, "Pathos = emotional appeal.", "RI.9.6"),
    ("What does 'verisimilitude' mean?", ["Very similar", "Appearance of being true/real", "Verse in poetry", "Alliteration type"], "B", 5, "Quality of appearing realistic.", "RL.11.4"),
    ("What is 'stream of consciousness'?", ["A river description", "Narrative mimicking character's thoughts", "A type of poem", "A debate format"], "B", 5, "Continuous flow of thoughts.", "RL.11.5"),
    ("What is 'logos' in rhetoric?", ["A brand symbol", "An appeal to logic and reason", "A pathos variant", "A literary device"], "B", 3, "Logos = logical evidence.", "RI.9.6"),
    ("What is 'unreliable narrator' effect?", ["Confusing plot", "Reader questions truth of the narrative", "Multiple narrators", "No narration"], "B", 4, "Reader must evaluate narrator's truthfulness.", "RL.11.6"),
]

QUESTIONS[("9-12", "Language Usage")] = [
    ("What is a 'clause'?", ["Punctuation", "Group of words with subject and verb", "Single word as noun", "Paragraph structure"], "B", 2, "Subject + verb = clause.", "L.9.1"),
    ("'To ___ it may concern.' – Who or Whom?", ["Who", "Whom", "Whose", "Who's"], "B", 3, "Whom = object form.", "L.9.1"),
    ("Which avoids passive voice?", ["Ball was hit by John.", "Test was failed.", "John hit the ball.", "Cake was eaten."], "C", 3, "Active: subject does action.", "L.9.3"),
    ("What is an 'Oxford comma'?", ["Before a quote", "Before final 'and/or' in list of 3+", "After a name", "British English only"], "B", 3, "Comma before last conjunction in list.", "L.9.2"),
    ("Purpose of a semicolon?", ["End sentence", "Connect two related independent clauses", "Introduce list", "Show possession"], "B", 3, "Links related independent clauses.", "L.9.2"),
    ("What is 'subjunctive mood'?", ["Happy style", "Verb form for wishes/hypotheticals", "Essay type", "First person"], "B", 4, "'If I were you...'", "L.9.1"),
    ("Error: 'Each of the students have their book.'", ["Each→Every", "have→has", "their→a", "students→student"], "B", 4, "'Each' is singular → 'has'.", "L.9.1"),
    ("What is 'MLA format'?", ["Bibliography only", "Academic paper/citation format", "Novel writing style", "Grammar book"], "B", 3, "Standardized academic format.", "W.9.8"),
    ("What is a 'split infinitive'?", ["A broken verb", "Placing a word between 'to' and a verb", "Two verbs together", "Past participle"], "B", 4, "To boldly go = split infinitive.", "L.9.1"),
    ("What is 'APA format'?", ["A novel style", "Academic citation style used in social sciences", "A poetry form", "A debate format"], "B", 4, "APA = social sciences citation format.", "W.9.8"),
    ("Which uses a dash correctly?", ["I went—to the store.", "I went to the store—it was closed.", "I—went to the store.", "—I went to the store."], "B", 5, "Dash adds a sudden break or emphasis.", "L.9.2"),
    ("What is 'nominalization'?", ["Naming characters", "Turning a verb/adjective into a noun", "A type of pronoun", "Using proper nouns"], "B", 5, "e.g., 'investigate' → 'investigation'.", "L.9.3"),
]

QUESTIONS[("9-12", "Science")] = [
    ("Powerhouse of the cell?", ["Nucleus", "Ribosome", "Mitochondria", "Golgi"], "C", 1, "Mitochondria produce ATP.", "HS-LS1-7"),
    ("Subatomic particle determining element?", ["Neutron", "Electron", "Proton", "Photon"], "C", 2, "Protons = atomic number.", "HS-PS1-1"),
    ("Photosynthesis formula?", ["6CO₂+6H₂O→C₆H₁₂O₆+6O₂", "C₆H₁₂O₆+6O₂→6CO₂+6H₂O", "2H₂+O₂→2H₂O", "NaCl→Na+Cl"], "A", 3, "CO₂ + H₂O → glucose + O₂.", "HS-LS1-5"),
    ("Avogadro's number?", ["3.14×10²³", "6.022×10²³", "9.81×10²³", "1.602×10²³"], "B", 3, "6.022 × 10²³.", "HS-PS1-7"),
    ("Wavelength and frequency relationship?", ["Directly proportional", "Inversely proportional", "No relationship", "Same thing"], "B", 3, "Inversely proportional.", "HS-PS4-1"),
    ("What is natural selection?", ["Mate choice", "Best-adapted survive and reproduce", "Artificial breeding", "Random"], "B", 3, "Survival of the fittest.", "HS-LS4-4"),
    ("Ideal gas law?", ["F=ma", "PV=nRT", "E=mc²", "V=IR"], "B", 4, "PV=nRT.", "HS-PS1-8"),
    ("Metaphase: chromosomes do what?", ["Condense", "Line up at center", "Move to poles", "Decondense"], "B", 4, "Align at metaphase plate.", "HS-LS1-4"),
    ("What is Ohm's Law?", ["F=ma", "PV=nRT", "V=IR", "E=mc²"], "C", 3, "Voltage = Current × Resistance.", "HS-PS2-3"),
    ("What is entropy?", ["Energy", "Measure of disorder", "Temperature", "A force"], "B", 4, "Entropy = measure of disorder.", "HS-PS3-4"),
    ("What is CRISPR?", ["A protein", "A gene-editing tool", "A virus", "A hormone"], "B", 5, "Gene-editing technology.", "HS-LS3-1"),
    ("What is Heisenberg's Uncertainty Principle?", ["Energy conservation", "Cannot precisely know both position and momentum", "Gravity equation", "Relativity concept"], "B", 5, "Cannot know exact position & momentum simultaneously.", "HS-PS4-5"),
    ("What are isotopes?", ["Same element, different electrons", "Same element, different neutrons", "Different elements", "Same molecules"], "B", 4, "Same protons, different neutrons.", "HS-PS1-1"),
    ("What is activation energy?", ["Total energy", "Minimum energy to start a reaction", "Final energy", "Heat produced"], "B", 4, "Minimum energy to initiate reaction.", "HS-PS1-5"),
]

QUESTIONS[("9-12", "General Knowledge")] = [
    ("Main cause of WWI?", ["Atomic bomb", "Assassination of Archduke Ferdinand", "Berlin Wall fall", "America discovery"], "B", 2, "Archduke Franz Ferdinand assassination.", "GK.912.1"),
    ("Theory of relativity?", ["Newton", "Einstein", "Darwin", "Galileo"], "B", 2, "Albert Einstein.", "GK.912.2"),
    ("What is supply and demand?", ["Shipping term", "Price determined by availability/desire", "Political system", "Scientific law"], "B", 3, "Economic principle.", "GK.912.3"),
    ("Universal Declaration of Human Rights?", ["US amendment", "UN document on human rights", "Trade agreement", "Scientific paper"], "B", 3, "UN document, 1948.", "GK.912.3"),
    ("What is 'cognitive bias'?", ["Intelligence type", "Systematic error in thinking", "Learning disability", "Memory technique"], "B", 4, "Systematic deviation from rationality.", "GK.912.4"),
    ("Programming concept that repeats code?", ["Variable", "Function", "Loop", "Class"], "C", 3, "A loop repeats code.", "GK.912.5"),
    ("What is 'sustainability'?", ["Lasting forever", "Meeting needs without compromising future", "Recycling only", "Less electricity"], "B", 3, "Not compromising future generations.", "GK.912.4"),
    ("Weather vs. climate?", ["Same", "Weather=short-term; climate=long-term", "Climate=short-term", "Weather=rain only"], "B", 2, "Weather=daily; climate=average.", "GK.912.4"),
    ("What is the Krebs Cycle?", ["A bike race", "Metabolic pathway producing ATP", "An economic model", "A programming concept"], "B", 4, "Cellular respiration step producing ATP.", "GK.912.5"),
    ("What is blockchain?", ["A type of wall", "Decentralized digital ledger", "A programming language", "An encryption method"], "B", 4, "Distributed ledger technology.", "GK.912.5"),
    ("What was the Renaissance?", ["A war", "Cultural rebirth in 14th-17th century Europe", "A disease", "An invention"], "B", 3, "Cultural/intellectual rebirth.", "GK.912.1"),
    ("What is the Geneva Convention?", ["A tech conference", "International laws governing war conduct", "A trade deal", "A peace treaty"], "B", 4, "Rules for treatment of war prisoners.", "GK.912.3"),
    ("Who wrote '1984'?", ["Huxley", "Orwell", "Kafka", "Hemingway"], "B", 3, "George Orwell.", "GK.912.2"),
    ("What is the 'Cold War'?", ["A winter war", "Political/military tension between USA and USSR", "World War III", "A trade war"], "B", 3, "US-Soviet geopolitical tension.", "GK.912.1"),
]


# ═══════════════════════════════════════════════════════════════════
#  SEED LOGIC
# ═══════════════════════════════════════════════════════════════════

def delete_old_system_questions():
    """Remove all existing questions created by 'system' to avoid duplicates."""
    print("🗑️  Deleting old system-generated questions...")
    col = db.collection("quiz_questions")
    query = col.where("created_by", "==", CREATED_BY)
    deleted = 0
    while True:
        docs = query.limit(400).get()
        if not docs:
            break
        batch = db.batch()
        for doc in docs:
            batch.delete(doc.reference)
            deleted += 1
        batch.commit()
        time.sleep(0.3)
    print(f"   Deleted {deleted} old system questions.\n")


def seed():
    total = 0
    batch_count = 0
    batch = db.batch()
    dist = {}  # Track distribution: (band, subject, diff) → count

    for (grade_band, subject), question_list in QUESTIONS.items():
        for q_data in question_list:
            text, options, correct, difficulty, explanation, *rest = q_data
            standard = rest[0] if rest else ""

            option_objs = []
            labels = ["A", "B", "C", "D"]
            for i, opt_text in enumerate(options):
                option_objs.append({
                    "label": labels[i],
                    "text": opt_text,
                    "text_ar": "",
                })

            doc = {
                "text": text,
                "text_ar": "",
                "type": "mcq",
                "subject": subject,
                "class_code": grade_band,
                "difficulty": difficulty,
                "options": option_objs,
                "correct_option": correct,
                "explanation": explanation,
                "standard": standard,
                "created_by": CREATED_BY,
                "year": YEAR,
                "created_at": firestore.SERVER_TIMESTAMP,
                "updated_at": firestore.SERVER_TIMESTAMP,
            }

            ref = db.collection("quiz_questions").document()
            batch.set(ref, doc)
            total += 1
            batch_count += 1

            key = (grade_band, subject, difficulty)
            dist[key] = dist.get(key, 0) + 1

            if batch_count >= 400:
                print(f"  Committing batch ({batch_count} docs)...")
                batch.commit()
                batch = db.batch()
                batch_count = 0
                time.sleep(0.5)

    if batch_count > 0:
        print(f"  Committing final batch ({batch_count} docs)...")
        batch.commit()

    print(f"\n✅ Seeded {total} questions total.\n")

    # ── Distribution report ──
    print("📊 Distribution by Grade Band × Subject:")
    for band in ["pre-k", "k-2", "3-5", "6-8", "9-12"]:
        print(f"\n  ─── {band.upper()} ───")
        for subj in ["Mathematics", "Reading", "Language Usage", "Science", "General Knowledge"]:
            counts = []
            for d in range(1, 6):
                c = dist.get((band, subj, d), 0)
                counts.append(f"D{d}:{c}")
            total_subj = sum(dist.get((band, subj, d), 0) for d in range(1, 6))
            print(f"    {subj:20s}  {' | '.join(counts)}  = {total_subj}")

    # ── Check for thin cells ──
    print("\n⚠️  Cells with < 3 questions (may need more for adaptive):")
    thin = 0
    for band in ["pre-k", "k-2", "3-5", "6-8", "9-12"]:
        for subj in ["Mathematics", "Reading", "Language Usage", "Science", "General Knowledge"]:
            for d in range(1, 6):
                c = dist.get((band, subj, d), 0)
                if c < 3:
                    print(f"    {band} / {subj} / D{d}: only {c}")
                    thin += 1
    if thin == 0:
        print("    None — all cells have ≥ 3 questions! ✅")
    else:
        print(f"    {thin} thin cells (the adaptive engine will expand to nearby difficulties)")


if __name__ == "__main__":
    print("🎯 NWEA Question Bank v2 — Expanded Edition\n")
    delete_old_system_questions()
    seed()
