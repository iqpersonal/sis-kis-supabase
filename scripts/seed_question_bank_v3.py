"""
Expanded NWEA-style Question Bank v3 — adds ~250 more MCQ questions.
Focuses on depth: 10+ new questions per (grade_band × subject) cell,
giving quizzes enough material for 30-40 question adaptive sessions.

Run after v2+supplement+patch to expand the pool.

Usage:
    python scripts/seed_question_bank_v3.py
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
# FORMAT: (text, [A,B,C,D], correct_letter, difficulty, explanation, standard)
# ─────────────────────────────────────────────────────────────────

QUESTIONS = {}

# ═══════════════════════════════════════════════════════════════════
#  PRE-K  (Ages 3–5)
# ═══════════════════════════════════════════════════════════════════

QUESTIONS[("pre-k", "Mathematics")] = [
    ("Count the hearts: ❤️❤️❤️❤️. How many?", ["2", "3", "4", "5"], "C", 1, "Count each heart: 1, 2, 3, 4.", "PK.CC.1"),
    ("Which shape has 4 sides that are all the same?", ["Circle", "Rectangle", "Square", "Triangle"], "C", 2, "A square has 4 equal sides.", "PK.G.2"),
    ("What number comes between 3 and 5?", ["2", "3", "4", "6"], "C", 2, "3, 4, 5 — so 4 is between.", "PK.CC.2"),
    ("If you have 3 toys and get 2 more, how many?", ["3", "4", "5", "6"], "C", 3, "3 + 2 = 5 toys.", "PK.OA.1"),
    ("Which is the smallest number: 7, 3, 5, 9?", ["7", "3", "5", "9"], "B", 3, "3 is the smallest.", "PK.CC.7"),
    ("How many sides does a rectangle have?", ["3", "4", "5", "6"], "B", 2, "A rectangle has 4 sides.", "PK.G.2"),
    ("What comes after 7?", ["6", "7", "8", "9"], "C", 1, "After 7 is 8.", "PK.CC.2"),
    ("If you eat 1 of 4 cookies, how many left?", ["1", "2", "3", "4"], "C", 4, "4 - 1 = 3 cookies left.", "PK.OA.2"),
    ("Count by 2s: 2, 4, __?", ["5", "6", "7", "8"], "B", 5, "Counting by 2s: 2, 4, 6.", "PK.CC.2"),
    ("Which group has fewer? 🔵🔵🔵 or 🔴🔴🔴🔴🔴?", ["Blue group", "Red group", "Same", "Cannot tell"], "A", 3, "3 blue < 5 red. Blue has fewer.", "PK.CC.6"),
]

QUESTIONS[("pre-k", "Reading")] = [
    ("What letter does 'moon' start with?", ["N", "M", "L", "O"], "B", 1, "Moon starts with M.", "PK.RF.3"),
    ("Which word rhymes with 'ball'?", ["Dog", "Tall", "Cup", "Fish"], "B", 2, "Ball and tall both end with '-all'.", "PK.RF.2"),
    ("What letter makes the 'sss' sound?", ["T", "P", "S", "B"], "C", 1, "The letter S makes the 'sss' sound.", "PK.RF.2"),
    ("Which is a character in a story?", ["The title", "A princess", "A page number", "The author"], "B", 2, "A princess is a character.", "PK.RL.3"),
    ("What happens at the END of a story?", ["Characters meet", "Problem starts", "Problem is solved", "Title is shown"], "C", 3, "At the end, the problem is usually solved.", "PK.RL.2"),
    ("How many syllables in 'watermelon'?", ["2", "3", "4", "5"], "C", 4, "Wa-ter-mel-on = 4 syllables.", "PK.RF.2"),
    ("Which word starts with the letter B?", ["Cat", "Dog", "Ball", "Fish"], "C", 1, "Ball starts with B.", "PK.RF.3"),
    ("What do we call someone who draws pictures in a book?", ["Author", "Illustrator", "Reader", "Printer"], "B", 3, "An illustrator draws book pictures.", "PK.RI.6"),
    ("Which two words start with the same letter: 'pig, pen, cat'?", ["pig and cat", "pen and cat", "pig and pen", "All different"], "C", 3, "Pig and pen both start with P.", "PK.RF.2"),
    ("If the pictures show rain and an umbrella, what is the story about?", ["Cooking", "A rainy day", "Playing sports", "Animals"], "B", 4, "Rain + umbrella = rainy day story.", "PK.RL.7"),
]

QUESTIONS[("pre-k", "Language Usage")] = [
    ("Which is a vegetable?", ["Cake", "Carrot", "Milk", "Bread"], "B", 1, "A carrot is a vegetable.", "PK.L.5"),
    ("What is the opposite of 'happy'?", ["Glad", "Sad", "Nice", "Fun"], "B", 2, "Happy and sad are opposites.", "PK.L.5"),
    ("Fill in: We ___ to school.", ["goes", "go", "going", "goed"], "B", 2, "'We go to school.'", "PK.L.1"),
    ("Which word describes the weather: 'sunny'?", ["A name", "An action", "A describing word", "A place"], "C", 3, "Sunny describes the weather.", "PK.L.5"),
    ("What is the opposite of 'open'?", ["Big", "Close", "Wide", "Long"], "B", 3, "Open and close are opposites.", "PK.L.5"),
    ("Fill in: The birds ___ flying.", ["is", "am", "are", "was"], "C", 3, "'The birds are flying.'", "PK.L.1"),
    ("Which word rhymes with 'tree'?", ["Car", "Bee", "Dog", "Hat"], "B", 4, "Tree and bee both end with '-ee'.", "PK.RF.2"),
    ("What is the plural of 'dog'?", ["Dog", "Dogs", "Doges", "Doggie"], "B", 4, "Add 's': dog → dogs.", "PK.L.1"),
    ("Fill in: He ___ eating lunch.", ["am", "is", "are", "be"], "B", 2, "'He is eating lunch.'", "PK.L.1"),
    ("Which sentence sounds right?", ["Me go park.", "I go to the park.", "Park go I.", "Go I park."], "B", 5, "'I go to the park' is correct.", "PK.L.1"),
]

QUESTIONS[("pre-k", "Science")] = [
    ("What color are most leaves in summer?", ["Red", "Green", "Blue", "White"], "B", 1, "Leaves are green in summer.", "PK.LS.1"),
    ("Which animal has feathers?", ["Dog", "Fish", "Bird", "Cat"], "C", 1, "Birds have feathers.", "PK.LS.1"),
    ("What do you need an umbrella for?", ["Sun", "Rain", "Wind", "Snow"], "B", 2, "Umbrellas protect from rain.", "PK.ESS.2"),
    ("Where does a fish live?", ["Tree", "Cave", "Water", "Nest"], "C", 1, "Fish live in water.", "PK.LS.1"),
    ("What season do flowers bloom?", ["Winter", "Fall", "Spring", "None"], "C", 2, "Flowers bloom in spring.", "PK.ESS.2"),
    ("What do baby birds live in?", ["Caves", "Nests", "Houses", "Ponds"], "B", 2, "Baby birds live in nests.", "PK.LS.1"),
    ("What happens to puddles on a hot day?", ["They get bigger", "They freeze", "They dry up", "They turn green"], "C", 3, "Heat evaporates the water.", "PK.PS.1"),
    ("Which animal has scales?", ["Bird", "Dog", "Fish", "Cat"], "C", 3, "Fish have scales.", "PK.LS.1"),
    ("What makes the noise we hear during a storm?", ["Rain", "Wind", "Thunder", "Sun"], "C", 4, "Thunder causes loud booming sounds.", "PK.ESS.2"),
    ("Do seeds need water to grow?", ["Yes", "No", "Only sometimes", "Never"], "A", 2, "Seeds need water, soil, and light.", "PK.LS.1"),
]

QUESTIONS[("pre-k", "General Knowledge")] = [
    ("What do you use to write?", ["Spoon", "Pencil", "Shoe", "Cup"], "B", 1, "A pencil is used for writing.", "PK.GK.1"),
    ("Where do students go to learn?", ["Hospital", "School", "Restaurant", "Park"], "B", 1, "Students go to school.", "PK.GK.1"),
    ("What country has the pyramids?", ["France", "China", "Egypt", "USA"], "C", 2, "The pyramids are in Egypt.", "PK.GK.2"),
    ("Which is a color of the rainbow?", ["Brown", "Black", "Orange", "Gray"], "C", 2, "Orange is in the rainbow.", "PK.GK.2"),
    ("What do we use to see things far away?", ["Glasses", "Binoculars", "Gloves", "Shoes"], "B", 3, "Binoculars help us see far.", "PK.GK.2"),
    ("How many wheels does a bicycle have?", ["1", "2", "3", "4"], "B", 2, "A bicycle has 2 wheels.", "PK.GK.1"),
    ("What holiday celebrates with fireworks?", ["Easter", "Christmas", "New Year's Eve", "Valentine's Day"], "C", 3, "Fireworks celebrate New Year's Eve.", "PK.GK.2"),
    ("What instrument do you blow to play?", ["Drum", "Guitar", "Flute", "Piano"], "C", 3, "You blow air into a flute.", "PK.GK.2"),
    ("Which animal is the tallest?", ["Elephant", "Horse", "Giraffe", "Bear"], "C", 4, "The giraffe is the tallest animal.", "PK.GK.3"),
    ("What is ice made of?", ["Milk", "Juice", "Water", "Air"], "C", 3, "Ice is frozen water.", "PK.GK.2"),
]

# ═══════════════════════════════════════════════════════════════════
#  K–2  (Ages 5–8)
# ═══════════════════════════════════════════════════════════════════

QUESTIONS[("k-2", "Mathematics")] = [
    ("What is 6 + 6?", ["10", "11", "12", "13"], "C", 1, "6 + 6 = 12.", "1.OA.1"),
    ("What is 14 - 7?", ["5", "6", "7", "8"], "C", 2, "14 - 7 = 7.", "1.OA.1"),
    ("How many tens are in 50?", ["4", "5", "6", "7"], "B", 2, "50 = 5 tens.", "1.NBT.2"),
    ("What is 8 × 2?", ["14", "15", "16", "18"], "C", 3, "8 × 2 = 16.", "2.OA.4"),
    ("What is 73 + 19?", ["82", "88", "92", "93"], "C", 3, "73 + 19 = 92.", "2.NBT.5"),
    ("Which shape has 6 sides?", ["Pentagon", "Hexagon", "Octagon", "Heptagon"], "B", 3, "A hexagon has 6 sides.", "2.G.1"),
    ("What is 56 - 28?", ["22", "28", "32", "38"], "B", 4, "56 - 28 = 28.", "2.NBT.5"),
    ("How many cents in a dollar?", ["10", "50", "100", "1000"], "C", 3, "100 cents = $1.", "2.MD.8"),
    ("What is 4 × 5?", ["15", "18", "20", "25"], "C", 2, "4 × 5 = 20.", "2.OA.4"),
    ("If there are 3 rows of 6 chairs, how many chairs total?", ["12", "15", "18", "21"], "C", 4, "3 × 6 = 18.", "2.OA.4"),
    ("What is 100 - 45?", ["45", "55", "65", "75"], "B", 4, "100 - 45 = 55.", "2.NBT.5"),
    ("What is 250 + 150?", ["350", "400", "450", "500"], "B", 5, "250 + 150 = 400.", "2.NBT.5"),
]

QUESTIONS[("k-2", "Reading")] = [
    ("What does an 'index' at the back of a book help you find?", ["Pictures", "Topics and page numbers", "The author", "The ending"], "B", 3, "An index lists topics alphabetically.", "RI.2.5"),
    ("What is the beginning of a story called?", ["Conclusion", "Introduction", "Climax", "Ending"], "B", 2, "Introduction = beginning.", "RL.2.5"),
    ("What does 'curious' mean?", ["Afraid", "Wanting to know more", "Tired", "Happy"], "B", 3, "Curious = wanting to learn or know.", "L.2.4"),
    ("If a character feels scared, what might happen next?", ["They laugh", "They run away or hide", "They dance", "They cook"], "B", 3, "Scared characters often flee or hide.", "RL.2.3"),
    ("What is a 'poem'?", ["A long story", "Writing with rhythm or rhyme", "A recipe", "A newspaper"], "B", 2, "Poems often have rhythm and rhyme.", "RL.2.10"),
    ("What does the word 'ancient' mean?", ["New", "Very old", "Small", "Fast"], "B", 4, "Ancient means very old.", "L.2.4"),
    ("What do we call words that sound the same but mean different things?", ["Synonyms", "Antonyms", "Homophones", "Verbs"], "C", 4, "Homophones: there/their, sea/see.", "L.2.4"),
    ("What is a 'moral' of a story?", ["The setting", "The lesson it teaches", "The title", "The characters"], "B", 3, "The moral is the lesson.", "RL.2.2"),
    ("Which word means the opposite of 'difficult'?", ["Hard", "Easy", "Slow", "Big"], "B", 2, "Easy is the opposite of difficult.", "L.2.5"),
    ("In a story, the 'problem' is also called the:", ["Setting", "Conflict", "Resolution", "Theme"], "B", 5, "The conflict is the story's problem.", "RL.2.5"),
]

QUESTIONS[("k-2", "Language Usage")] = [
    ("What is the past tense of 'see'?", ["Seed", "Saw", "Seeing", "Sees"], "B", 3, "See → saw.", "L.1.1"),
    ("Which is a proper noun?", ["city", "dog", "Sarah", "river"], "C", 2, "Sarah is a name = proper noun.", "L.1.1"),
    ("Fill in: 'He ___ a book every night.'", ["read", "reads", "reading", "readed"], "B", 2, "'He reads a book.'", "L.1.1"),
    ("What is a compound word?", ["A long word", "Two words joined: sun+flower", "A plural word", "A verb"], "B", 3, "Sunflower = sun + flower.", "L.2.4"),
    ("Which sentence has correct punctuation?", ["what is your name", "What is your name?", "what is your name.", "What is your name"], "B", 3, "Capital letter, question mark.", "L.1.2"),
    ("What is the opposite of 'above'?", ["Over", "Under", "Beside", "Behind"], "B", 2, "Above and under are opposites.", "L.2.5"),
    ("Fill in: 'The children ___ playing in the yard.'", ["is", "am", "are", "was"], "C", 3, "'The children are playing.'", "L.1.1"),
    ("Which is a describing word (adjective)?", ["Run", "Quickly", "Bright", "And"], "C", 2, "Bright describes something.", "L.1.1"),
    ("What type of sentence shows excitement?", ["Question", "Declarative", "Exclamatory", "Command"], "C", 4, "Exclamatory sentences show excitement!", "L.2.1"),
    ("What does the contraction 'can't' mean?", ["Can", "Cannot", "Could", "Would not"], "B", 3, "Can't = cannot.", "L.2.2"),
]

QUESTIONS[("k-2", "Science")] = [
    ("What do we call frozen water?", ["Steam", "Ice", "Fog", "Dew"], "B", 1, "Frozen water = ice.", "2-PS1-4"),
    ("What part of the plant is underground?", ["Leaves", "Stem", "Roots", "Flower"], "C", 2, "Roots grow underground.", "1-LS1-1"),
    ("Why do we see lightning before hearing thunder?", ["Sound is louder", "Light travels faster than sound", "Thunder is quieter", "Lightning is closer"], "B", 4, "Light travels faster than sound.", "1-PS4-1"),
    ("Which animal is a mammal?", ["Snake", "Frog", "Dolphin", "Lizard"], "C", 3, "Dolphins are mammals — warm-blooded, breathe air.", "2-LS4-1"),
    ("What does a thermometer measure?", ["Weight", "Temperature", "Speed", "Length"], "B", 2, "Thermometers measure temperature.", "2-MD.1"),
    ("What makes a rainbow appear?", ["Wind", "Clouds", "Sunlight and rain", "Night"], "C", 3, "Sunlight through raindrops creates rainbows.", "1-PS4-3"),
    ("What do herbivores eat?", ["Meat", "Plants", "Fish", "Insects"], "B", 2, "Herbivores eat only plants.", "2-LS4-1"),
    ("What gas do plants release?", ["Carbon dioxide", "Nitrogen", "Oxygen", "Hydrogen"], "C", 4, "Plants release oxygen during photosynthesis.", "2-LS2-1"),
    ("Which is the closest star to Earth?", ["Polaris", "Sirius", "The Sun", "Betelgeuse"], "C", 3, "The Sun is the closest star.", "1-ESS1-1"),
    ("What keeps us from floating off Earth?", ["Wind", "Air", "Gravity", "Magnets"], "C", 2, "Gravity keeps us grounded.", "K-PS2-1"),
]

QUESTIONS[("k-2", "General Knowledge")] = [
    ("What color is a stop sign?", ["Blue", "Green", "Red", "Yellow"], "C", 1, "Stop signs are red.", "GK.K2.1"),
    ("Which animal is the king of the jungle?", ["Tiger", "Elephant", "Lion", "Gorilla"], "C", 2, "The lion is often called king of the jungle.", "GK.K2.1"),
    ("What instrument has strings and a bow?", ["Drums", "Piano", "Violin", "Trumpet"], "C", 3, "A violin uses a bow on strings.", "GK.K2.2"),
    ("What is the capital of Saudi Arabia?", ["Jeddah", "Mecca", "Riyadh", "Dammam"], "C", 3, "Riyadh is the capital.", "GK.K2.3"),
    ("How many legs does a spider have?", ["4", "6", "8", "10"], "C", 2, "Spiders have 8 legs.", "GK.K2.2"),
    ("Which planet has rings?", ["Mars", "Jupiter", "Saturn", "Venus"], "C", 3, "Saturn has visible rings.", "GK.K2.3"),
    ("What material is glass made from?", ["Wood", "Sand", "Metal", "Paper"], "B", 4, "Glass is made from heated sand.", "GK.K2.3"),
    ("How many sides does a triangle have?", ["2", "3", "4", "5"], "B", 1, "Triangle = 3 sides.", "GK.K2.1"),
    ("What country gave the Statue of Liberty to the USA?", ["England", "Spain", "France", "Germany"], "C", 5, "France gave the Statue of Liberty.", "GK.K2.3"),
    ("What is the boiling point of water?", ["0°C", "50°C", "100°C", "200°C"], "C", 5, "Water boils at 100°C.", "GK.K2.3"),
]

# ═══════════════════════════════════════════════════════════════════
#  3–5  (Ages 8–11)
# ═══════════════════════════════════════════════════════════════════

QUESTIONS[("3-5", "Mathematics")] = [
    ("What is 7 × 9?", ["56", "63", "72", "81"], "B", 2, "7 × 9 = 63.", "3.OA.7"),
    ("What is 3/4 - 1/4?", ["1/4", "1/2", "2/4", "3/4"], "B", 2, "3/4 - 1/4 = 2/4 = 1/2.", "4.NF.3"),
    ("What is the area of a rectangle 7 × 5?", ["12", "24", "35", "40"], "C", 2, "7 × 5 = 35.", "4.MD.3"),
    ("What is 2,500 ÷ 50?", ["25", "40", "50", "100"], "C", 3, "2,500 ÷ 50 = 50.", "5.NBT.6"),
    ("Convert 3/4 to a decimal.", ["0.25", "0.50", "0.75", "0.80"], "C", 3, "3 ÷ 4 = 0.75.", "4.NF.6"),
    ("What is 1/3 of 36?", ["9", "10", "12", "18"], "C", 3, "36 ÷ 3 = 12.", "5.NF.4"),
    ("What is the LCM of 4 and 6?", ["6", "8", "12", "24"], "C", 4, "LCM(4,6) = 12.", "4.OA.4"),
    ("A rectangle has perimeter 30 cm and width 5 cm. What is its length?", ["5", "10", "15", "20"], "B", 4, "P=2(l+w); 30=2(l+5); l=10.", "4.MD.3"),
    ("What is 0.6 + 0.45?", ["0.65", "0.95", "1.05", "1.10"], "C", 3, "0.6 + 0.45 = 1.05.", "5.NBT.7"),
    ("How many faces does a cube have?", ["4", "6", "8", "12"], "B", 2, "A cube has 6 faces.", "3.G.1"),
    ("What is 4² (4 squared)?", ["8", "12", "16", "20"], "C", 3, "4 × 4 = 16.", "5.NBT.2"),
    ("Which fraction is greater: 2/5 or 3/8?", ["2/5", "3/8", "Equal", "Cannot tell"], "A", 4, "2/5=0.40, 3/8=0.375. 2/5 is greater.", "4.NF.2"),
]

QUESTIONS[("3-5", "Reading")] = [
    ("What is a 'biography'?", ["A made-up story", "A story about someone's life written by another person", "A poem", "A recipe"], "B", 2, "Biography = someone else writes your life story.", "RI.4.3"),
    ("What does 'compare' mean?", ["To write", "To find how things are alike", "To draw", "To listen"], "B", 2, "Compare = find similarities.", "RI.3.9"),
    ("Which is NOT a genre?", ["Mystery", "Science Fiction", "Dictionary", "Fantasy"], "C", 3, "A dictionary is a reference, not a genre.", "RL.4.10"),
    ("What is a 'stanza' in a poem?", ["A title", "A group of lines", "A rhyming word", "The last line"], "B", 3, "Stanza = a verse; group of lines.", "RL.4.5"),
    ("What does the suffix '-less' mean?", ["Full of", "Without", "More", "Again"], "B", 3, "'-less' = without. Homeless = without a home.", "L.3.4"),
    ("What is 'dialogue' in a story?", ["Description", "Characters talking", "The setting", "The moral"], "B", 2, "Dialogue = characters' spoken words.", "RL.3.3"),
    ("In 'The fox was sly,' what does 'sly' mean?", ["Friendly", "Clever and sneaky", "Loud", "Slow"], "B", 3, "Sly = clever in a sneaky way.", "L.4.4"),
    ("What is a 'glossary'?", ["A type of story", "A list of key words and definitions", "An index", "A chapter"], "B", 2, "Glossary = definitions at the back of a book.", "RI.3.5"),
    ("What is 'personification'?", ["Giving animals colors", "Giving human qualities to non-human things", "A true story", "A type of poem"], "B", 4, "'The sun smiled down' = personification.", "RL.4.4"),
    ("What does 'contrast' mean?", ["To compare", "To find differences", "To copy", "To ignore"], "B", 3, "Contrast = find how things differ.", "RI.5.9"),
]

QUESTIONS[("3-5", "Language Usage")] = [
    ("What is a 'pronoun'?", ["A verb", "A word that replaces a noun", "An adjective", "A conjunction"], "B", 2, "He, she, it, they = pronouns.", "L.3.1"),
    ("Which word is an adverb?", ["Happy", "Slowly", "Cat", "Big"], "B", 3, "Slowly describes how = adverb.", "L.3.1"),
    ("What is the correct plural of 'child'?", ["Childs", "Childes", "Children", "Childrens"], "C", 3, "Child → children (irregular).", "L.3.1"),
    ("Fill in: 'The team ___ winning.'", ["are", "is", "am", "be"], "B", 3, "'The team is winning.' Team = singular.", "L.3.1"),
    ("What is a 'homophone'?", ["A word with two meanings", "Two words that sound the same but differ in meaning/spelling", "A big word", "A silent letter"], "B", 4, "e.g., there/their/they're.", "L.4.1"),
    ("What punctuation introduces a list?", ["Period", "Comma", "Colon", "Semicolon"], "C", 4, "A colon introduces a list: eggs, milk, bread.", "L.4.2"),
    ("Which sentence is in past tense?", ["She runs.", "She will run.", "She ran.", "She is running."], "C", 2, "Ran = past tense of run.", "L.3.1"),
    ("What does 'its' (no apostrophe) mean?", ["It is", "It has", "Belonging to it", "It was"], "C", 4, "Its = possessive. It's = it is.", "L.4.1"),
    ("What is a 'predicate'?", ["The subject", "The part of sentence that tells what the subject does", "A question", "A noun"], "B", 5, "Predicate = verb + rest of sentence.", "L.3.1"),
    ("Which word is misspelled?", ["receive", "believe", "acheive", "perceive"], "C", 5, "Correct spelling: achieve.", "L.3.2"),
]

QUESTIONS[("3-5", "Science")] = [
    ("What are the 5 senses?", ["Sight, hearing, smell, taste, touch", "Running, jumping, walking, sitting, sleeping", "Red, blue, green, yellow, white", "Happy, sad, angry, scared, surprised"], "A", 1, "The 5 senses.", "3-LS1-1"),
    ("What type of energy comes from the Sun?", ["Sound", "Light and heat", "Wind", "Electricity"], "B", 2, "The Sun emits light and heat energy.", "4-PS3-2"),
    ("What is the food chain order?", ["Consumer→Producer→Decomposer", "Producer→Consumer→Decomposer", "Decomposer→Producer→Consumer", "Consumer→Decomposer→Producer"], "B", 3, "Producers → consumers → decomposers.", "5-LS2-1"),
    ("What causes wind?", ["The Moon", "Uneven heating of Earth's surface", "Gravity", "Earthquakes"], "B", 4, "Temperature differences create air movement.", "3-ESS2-1"),
    ("Which material is a good conductor of electricity?", ["Rubber", "Wood", "Copper", "Glass"], "C", 3, "Metals like copper conduct electricity well.", "4-PS3-2"),
    ("What is the largest organ in the human body?", ["Brain", "Liver", "Skin", "Heart"], "C", 3, "Skin is the largest organ.", "4-LS1-1"),
    ("What is condensation?", ["Water turning to ice", "Water vapor turning to liquid", "Ice turning to water", "Water turning to vapor"], "B", 4, "Condensation = gas → liquid.", "3-ESS2-1"),
    ("What is the function of the skeleton?", ["Digesting food", "Supporting and protecting the body", "Breathing", "Thinking"], "B", 2, "Bones support and protect organs.", "4-LS1-1"),
    ("What are fossil fuels?", ["Fresh vegetables", "Energy sources from ancient organisms", "Types of rocks", "Water sources"], "B", 5, "Coal, oil, gas from prehistoric organisms.", "4-ESS3-1"),
    ("What is the difference between an asteroid and a comet?", ["No difference", "Asteroids are rocky; comets have ice and tails", "Comets are bigger", "Asteroids are from the Moon"], "B", 5, "Comets have ice that forms tails near the Sun.", "5-ESS1-1"),
]

QUESTIONS[("3-5", "General Knowledge")] = [
    ("What is the largest ocean?", ["Atlantic", "Indian", "Arctic", "Pacific"], "D", 2, "The Pacific Ocean is largest.", "GK.35.1"),
    ("What language do people in Brazil speak?", ["Spanish", "Portuguese", "French", "Italian"], "B", 3, "Portuguese.", "GK.35.1"),
    ("What is the smallest country in the world?", ["Monaco", "Luxembourg", "Vatican City", "Malta"], "C", 4, "Vatican City is the smallest country.", "GK.35.1"),
    ("Who discovered gravity?", ["Einstein", "Newton", "Galileo", "Tesla"], "B", 3, "Isaac Newton.", "GK.35.3"),
    ("What does 'extinct' mean?", ["Very rare", "No longer exists", "Very old", "Sleeping"], "B", 3, "Extinct = no living members remain.", "GK.35.3"),
    ("What is the Great Wall of China for?", ["Decoration", "Defense", "Transportation", "Communication"], "B", 3, "Built for defense against invaders.", "GK.35.1"),
    ("Which instrument uses keys and hammers?", ["Guitar", "Drum", "Piano", "Flute"], "C", 2, "Piano keys activate hammers hitting strings.", "GK.35.2"),
    ("What is the currency of the UK?", ["Euro", "Dollar", "Pound", "Franc"], "C", 4, "British Pound Sterling.", "GK.35.1"),
    ("What does a compass show?", ["Time", "Temperature", "Direction", "Speed"], "C", 2, "A compass shows direction (N, S, E, W).", "GK.35.3"),
    ("How many teeth does an adult human have?", ["20", "28", "32", "36"], "C", 4, "Adults have 32 teeth.", "GK.35.3"),
]

# ═══════════════════════════════════════════════════════════════════
#  6–8  (Ages 11–14)
# ═══════════════════════════════════════════════════════════════════

QUESTIONS[("6-8", "Mathematics")] = [
    ("What is the GCF of 24 and 36?", ["6", "8", "12", "18"], "C", 3, "GCF(24,36) = 12.", "6.NS.4"),
    ("Simplify: 5(2x + 3)", ["10x + 3", "10x + 15", "7x + 3", "7x + 8"], "B", 3, "5×2x + 5×3 = 10x + 15.", "6.EE.3"),
    ("What is -5 × (-3)?", ["-15", "-8", "8", "15"], "D", 2, "Negative × negative = positive: 15.", "7.NS.2"),
    ("What is the median of 3, 7, 5, 9, 1?", ["3", "5", "7", "9"], "B", 3, "Sorted: 1,3,5,7,9. Median = 5.", "6.SP.3"),
    ("What is 3/5 as a percentage?", ["30%", "35%", "60%", "65%"], "C", 2, "3/5 = 0.60 = 60%.", "6.RP.3"),
    ("Solve: 4x - 7 = 13", ["3", "4", "5", "6"], "C", 3, "4x = 20, x = 5.", "7.EE.4"),
    ("What is the surface area of a cube with side 3?", ["18", "27", "36", "54"], "D", 4, "6 × 3² = 54.", "7.G.6"),
    ("What is (-2)³?", ["-6", "-8", "6", "8"], "B", 4, "(-2)×(-2)×(-2) = -8.", "8.EE.1"),
    ("If f(x) = 2x + 1, what is f(4)?", ["7", "8", "9", "10"], "C", 2, "f(4) = 2(4)+1 = 9.", "8.F.1"),
    ("What is the Pythagorean theorem?", ["a+b=c", "a²+b²=c²", "a×b=c", "a/b=c"], "B", 3, "a² + b² = c².", "8.G.7"),
    ("Solve: x/3 + 2 = 5", ["3", "6", "9", "12"], "C", 3, "x/3 = 3, x = 9.", "7.EE.4"),
    ("What is 40% of 250?", ["80", "90", "100", "120"], "C", 3, "0.40 × 250 = 100.", "7.RP.3"),
]

QUESTIONS[("6-8", "Reading")] = [
    ("What does 'protagonist' mean?", ["Villain", "Main character", "Narrator", "Author"], "B", 2, "Protagonist = main character.", "RL.6.3"),
    ("What is 'foreshadowing'?", ["A summary", "Hints about future events", "Describing the past", "A character's name"], "B", 3, "Foreshadowing = clues about what comes next.", "RL.7.3"),
    ("What is an 'antagonist'?", ["The hero", "A helper", "The character opposing the protagonist", "A narrator"], "C", 3, "Antagonist = opponent of the main character.", "RL.6.3"),
    ("What is 'symbolism'?", ["Using numbers", "Using an object to represent a deeper meaning", "Writing dialogue", "A type of poem"], "B", 4, "Dove = peace, red = passion.", "RL.7.4"),
    ("What does 'omniscient' narrator mean?", ["First person", "All-knowing", "Limited perspective", "Unreliable"], "B", 4, "Omniscient = knows everything about all characters.", "RL.7.6"),
    ("What is 'mood' in literature?", ["Author's attitude", "The feeling the reader gets", "The setting", "The theme"], "B", 3, "Mood = emotional atmosphere for the reader.", "RL.6.4"),
    ("What is a 'flashback'?", ["A bright light", "Going back to an earlier time in the story", "A fast-forward", "An ending"], "B", 3, "Flashback = scene from the past.", "RL.7.3"),
    ("What is the purpose of a 'bibliography'?", ["To summarize", "To list sources used", "To introduce characters", "To describe the setting"], "B", 3, "Bibliography = list of references.", "RI.8.8"),
    ("What does 'elicit' mean?", ["To hide", "To draw out or bring forth", "To ignore", "To describe"], "B", 4, "Elicit = draw out a response.", "L.8.4"),
    ("What is 'dramatic irony'?", ["A funny scene", "When the audience knows something characters don't", "A character laughing", "A surprise ending"], "B", 5, "Audience has knowledge characters lack.", "RL.8.6"),
]

QUESTIONS[("6-8", "Language Usage")] = [
    ("What type of word is 'quickly'?", ["Noun", "Verb", "Adjective", "Adverb"], "D", 2, "Quickly describes how = adverb.", "L.6.1"),
    ("Which sentence is grammatically correct?", ["Me and him went.", "Him and I went.", "He and I went.", "I and he went."], "C", 3, "'He and I' is correct as subject.", "L.6.1"),
    ("What is a 'metaphor'?", ["A comparison using 'like'", "A direct comparison without 'like' or 'as'", "An exaggeration", "A question"], "B", 3, "'Life is a journey' = metaphor.", "L.7.5"),
    ("Which word is an antonym of 'generous'?", ["Kind", "Selfish", "Wealthy", "Gentle"], "B", 2, "Selfish = opposite of generous.", "L.6.5"),
    ("What does 'affect' mean as a verb?", ["Result", "To influence or change", "A feeling", "To create"], "B", 3, "Affect (verb) = to influence.", "L.6.1"),
    ("Which is a run-on sentence?", ["I like pizza.", "I like pizza it is great.", "I like pizza, and it is great.", "Pizza is great!"], "B", 4, "Two clauses without proper punctuation.", "L.7.1"),
    ("What is the correct form: 'If I ___ you, I'd study more.'?", ["was", "were", "am", "is"], "B", 4, "Subjunctive mood: 'If I were you.'", "L.8.1"),
    ("What is 'alliteration'?", ["Repeating vowel sounds", "Repeating consonant sounds at the start of words", "A type of rhyme", "An exaggeration"], "B", 3, "'Peter Piper picked peppers' = alliteration.", "L.7.5"),
    ("What does 'concise' mean?", ["Very long", "Brief and to the point", "Complicated", "Funny"], "B", 3, "Concise = short and clear.", "L.7.3"),
    ("Which correctly uses an apostrophe?", ["The dogs bowl", "The dog's bowl", "The dogs' bowl's", "The dog bowl's"], "B", 3, "Dog's = belonging to one dog.", "L.6.2"),
]

QUESTIONS[("6-8", "Science")] = [
    ("What is an atom?", ["A cell", "The smallest unit of an element", "A molecule", "A compound"], "B", 2, "Atoms are the building blocks of matter.", "MS-PS1-1"),
    ("What is photosynthesis?", ["Animals eating", "Plants making food from sunlight", "Rock formation", "Water cycle"], "B", 2, "Plants use light to make glucose.", "MS-LS1-6"),
    ("What is the function of red blood cells?", ["Fight infection", "Carry oxygen", "Clot blood", "Digest food"], "B", 3, "Red blood cells transport oxygen.", "MS-LS1-3"),
    ("What is an ecosystem?", ["A single organism", "A community of living things and their environment", "A type of cell", "A biome only"], "B", 3, "Ecosystem = living + nonliving interacting.", "MS-LS2-3"),
    ("What device measures electrical current?", ["Voltmeter", "Ammeter", "Thermometer", "Barometer"], "B", 4, "Ammeter measures current (amps).", "MS-PS2-3"),
    ("What is the difference between weathering and erosion?", ["Same thing", "Weathering breaks down; erosion moves material", "Erosion breaks down", "Weathering is only by water"], "B", 4, "Weathering = breaking; erosion = transporting.", "MS-ESS2-2"),
    ("What is a catalyst?", ["A product", "A substance that speeds up a reaction without being consumed", "A reactant", "Energy"], "B", 5, "Catalysts lower activation energy.", "MS-PS1-6"),
    ("Which kingdom includes mushrooms?", ["Plantae", "Animalia", "Fungi", "Protista"], "C", 3, "Mushrooms are fungi.", "MS-LS1-1"),
    ("What is the order of planets from the Sun?", ["Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune", "Venus, Mercury, Earth, Mars, Saturn, Jupiter, Uranus, Neptune", "Mercury, Earth, Venus, Mars, Jupiter, Saturn, Uranus, Neptune", "Mercury, Venus, Mars, Earth, Jupiter, Saturn, Neptune, Uranus"], "A", 3, "My Very Eager Mother Just Served Us Nachos.", "MS-ESS1-2"),
    ("What is the half-life of a radioactive element?", ["Time to double", "Time for half the atoms to decay", "Total lifespan", "Time to react"], "B", 5, "Half-life = time for 50% of atoms to decay.", "MS-PS1-4"),
]

QUESTIONS[("6-8", "General Knowledge")] = [
    ("What is the currency of India?", ["Dollar", "Rupee", "Yen", "Pound"], "B", 2, "Indian Rupee.", "GK.68.2"),
    ("Who invented the light bulb?", ["Tesla", "Edison", "Bell", "Newton"], "B", 2, "Thomas Edison.", "GK.68.2"),
    ("What ocean lies between Europe and America?", ["Pacific", "Indian", "Atlantic", "Arctic"], "C", 2, "The Atlantic Ocean.", "GK.68.1"),
    ("What is the Great Wall of China made of?", ["Wood", "Stone and brick", "Metal", "Sand"], "B", 3, "Mostly stone, brick, and tamped earth.", "GK.68.3"),
    ("What is 'democracy'?", ["Rule by one person", "Government by the people", "Military rule", "No government"], "B", 3, "Democracy = people choose leaders.", "GK.68.3"),
    ("What organ filters blood in the body?", ["Heart", "Lungs", "Kidneys", "Stomach"], "C", 3, "Kidneys filter waste from blood.", "GK.68.4"),
    ("What is the Bermuda Triangle known for?", ["Beautiful beaches", "Mysterious disappearances", "Coral reefs", "Deep-sea fish"], "B", 4, "Ships and planes reportedly vanished.", "GK.68.4"),
    ("What planet is known as the Morning Star?", ["Mars", "Jupiter", "Venus", "Mercury"], "C", 3, "Venus is visible at dawn.", "GK.68.4"),
    ("What does 'UNESCO' stand for?", ["United Nations Educational, Scientific and Cultural Organization", "Universal Network for Science and Culture", "United Nations Economic Security Council", "Universal Education System for Countries"], "A", 5, "UNESCO = UN agency for education and culture.", "GK.68.3"),
    ("What is the world's largest rainforest?", ["Congo", "Amazon", "Daintree", "Tongass"], "B", 3, "The Amazon rainforest in South America.", "GK.68.1"),
]

# ═══════════════════════════════════════════════════════════════════
#  9–12  (Ages 14–18)
# ═══════════════════════════════════════════════════════════════════

QUESTIONS[("9-12", "Mathematics")] = [
    ("What is the quadratic formula?", ["x = b/2a", "x = (-b ± √(b²-4ac)) / 2a", "x = -b/a", "x = 2a/b"], "B", 3, "Quadratic formula for ax²+bx+c=0.", "HSA.REI.4"),
    ("What is the derivative of sin(x)?", ["cos(x)", "-cos(x)", "sin(x)", "-sin(x)"], "A", 3, "d/dx sin(x) = cos(x).", "HSF.IF.6"),
    ("What is tan(45°)?", ["0", "1/2", "1", "√3"], "C", 3, "tan(45°) = 1.", "HSG.SRT.6"),
    ("What is the sum of an arithmetic series: 1+2+3+...+100?", ["5000", "5050", "5100", "10000"], "B", 4, "n(n+1)/2 = 100×101/2 = 5050.", "HSA.SSE.4"),
    ("Solve: 3^x = 81", ["2", "3", "4", "5"], "C", 3, "3⁴ = 81, so x = 4.", "HSF.LE.4"),
    ("What is the equation of a circle with center (0,0) and radius 5?", ["x²+y²=5", "x²+y²=10", "x²+y²=25", "(x-5)²+y²=0"], "C", 3, "x²+y²=r²=25.", "HSG.GPE.1"),
    ("What is the range of f(x) = x²?", ["All real numbers", "y ≥ 0", "y > 0", "y ≤ 0"], "B", 3, "x² is always ≥ 0.", "HSF.IF.1"),
    ("What is 8! (8 factorial)?", ["5040", "40320", "362880", "3628800"], "B", 4, "8! = 40320.", "HSS.CP.9"),
    ("What is the dot product of (1,2) and (3,4)?", ["5", "7", "10", "11"], "D", 4, "1×3 + 2×4 = 3+8 = 11.", "HSN.VM.11"),
    ("What is the limit of sin(x)/x as x→0?", ["0", "1", "∞", "Undefined"], "B", 5, "lim(sin(x)/x) = 1 as x→0.", "HSF.IF.6"),
    ("What is the area of a sector with radius 6 and angle 60°?", ["6π", "12π", "18π", "36π"], "A", 4, "(60/360)πr² = (1/6)(36π) = 6π.", "HSG.C.5"),
    ("What is log₂(32)?", ["3", "4", "5", "6"], "C", 3, "2⁵ = 32, so log₂(32) = 5.", "HSF.BF.5"),
]

QUESTIONS[("9-12", "Reading")] = [
    ("What is a 'monologue'?", ["A conversation", "A long speech by one character", "A poem", "A stage direction"], "B", 2, "Monologue = one person speaking at length.", "RL.9.5"),
    ("What is 'catharsis'?", ["A type of poem", "Emotional release experienced by the audience", "A character type", "A setting"], "B", 4, "Catharsis = purging of emotions through art.", "RL.11.4"),
    ("What is the difference between 'mood' and 'tone'?", ["Same thing", "Mood = reader's feeling; tone = author's attitude", "Mood = author's attitude", "Tone = reader's feeling"], "B", 3, "Mood for reader, tone from author.", "RL.9.4"),
    ("What is a 'bildungsroman'?", ["A mystery novel", "A coming-of-age story", "A love story", "A war novel"], "B", 5, "Bildungsroman = growth and education of protagonist.", "RL.11.4"),
    ("What is 'satire'?", ["A love poem", "Using humor to criticize society", "An adventure story", "Historical fiction"], "B", 3, "Satire = humor + social criticism.", "RL.9.6"),
    ("What is an 'epigraph'?", ["A type of poetry", "A quote at the beginning of a book/chapter", "The final paragraph", "A character name"], "B", 4, "Epigraph = introductory quote.", "RL.9.5"),
    ("What does 'didactic' mean?", ["Entertaining", "Intended to teach or instruct", "Mysterious", "Humorous"], "B", 4, "Didactic = designed to educate.", "RI.11.6"),
    ("What is 'free verse'?", ["Poetry with strict rhyme", "Poetry without regular meter or rhyme", "A prose style", "A type of essay"], "B", 3, "Free verse = no fixed rhyme or meter.", "RL.9.5"),
    ("What is the purpose of an 'epilogue'?", ["Introduce characters", "Provide closure after the main story", "Set the mood", "Describe the setting"], "B", 3, "Epilogue = wrap-up after the story.", "RL.9.5"),
    ("What does 'ambivalent' mean?", ["Certain", "Having mixed feelings", "Happy", "Angry"], "B", 4, "Ambivalent = conflicting emotions.", "L.11.4"),
]

QUESTIONS[("9-12", "Language Usage")] = [
    ("What is a 'thesis' in an essay?", ["The introduction", "The main argument or claim", "A quote", "The conclusion"], "B", 2, "Thesis = central argument.", "W.9.1"),
    ("What is 'plagiarism'?", ["Good research", "Using someone's work without credit", "A writing style", "A punctuation rule"], "B", 2, "Plagiarism = uncredited use of others' work.", "W.9.8"),
    ("Which uses a semicolon correctly?", ["I like pizza; and salad.", "I like pizza; it's my favorite.", "I; like pizza.", "Pizza; salad."], "B", 3, "Semicolon connects related independent clauses.", "L.9.2"),
    ("What is 'tone' in writing?", ["The font", "The writer's attitude toward the subject", "The volume", "The genre"], "B", 3, "Tone = attitude conveyed through word choice.", "L.9.3"),
    ("What is an 'appositive'?", ["A verb phrase", "A noun phrase that renames another noun", "An adjective", "A conjunction"], "B", 4, "'My dog, a golden retriever, is friendly.'", "L.9.1"),
    ("What is the difference between 'who' and 'whom'?", ["Same usage", "Who=subject, whom=object", "Whom=subject, who=object", "Whom is archaic"], "B", 4, "Who did it (subject). To whom (object).", "L.9.1"),
    ("What is a 'compound-complex sentence'?", ["Two simple sentences", "Two+ independent clauses + one+ dependent clause", "A very long sentence", "A sentence with semicolons"], "B", 5, "Multiple independent + dependent clauses.", "L.9.1"),
    ("What is 'diction'?", ["A dictionary", "The choice of words in writing/speech", "Pronunciation guide", "A grammar rule"], "B", 3, "Diction = word choice.", "L.9.3"),
    ("What is a 'non sequitur'?", ["A logical argument", "A conclusion that doesn't follow from the premise", "A type of evidence", "A transition word"], "B", 5, "Non sequitur = illogical conclusion.", "L.9.3"),
    ("Which is correct: 'who's' or 'whose'? '___ book is this?'", ["Who's", "Whose", "Whos", "Whoes"], "B", 3, "Whose = possessive. Who's = who is.", "L.9.1"),
]

QUESTIONS[("9-12", "Science")] = [
    ("What is an ion?", ["A neutral atom", "An atom with a charge (gained/lost electrons)", "A molecule", "A compound"], "B", 2, "Ion = charged atom.", "HS-PS1-1"),
    ("What is the speed of sound in air (approximately)?", ["100 m/s", "343 m/s", "500 m/s", "1000 m/s"], "B", 3, "~343 m/s at room temperature.", "HS-PS4-1"),
    ("What is the function of mRNA?", ["Store genetic info", "Carry genetic instructions from DNA to ribosome", "Build proteins", "Protect DNA"], "B", 4, "mRNA = messenger RNA carries code.", "HS-LS1-1"),
    ("What is Le Chatelier's Principle?", ["Energy conservation", "A system in equilibrium responds to minimize changes", "F=ma", "Entropy always increases"], "B", 5, "Equilibrium shifts to counteract disturbances.", "HS-PS1-6"),
    ("What is the difference between fission and fusion?", ["Same process", "Fission splits atoms; fusion joins atoms", "Fusion splits atoms", "They both only join atoms"], "B", 4, "Fission = splitting; fusion = combining nuclei.", "HS-PS1-8"),
    ("What is the unit of electric resistance?", ["Watt", "Ampere", "Ohm", "Volt"], "C", 2, "Resistance measured in ohms (Ω).", "HS-PS2-3"),
    ("What is an exothermic reaction?", ["Absorbs heat", "Releases heat", "No energy change", "Only in biology"], "B", 3, "Exothermic = releases energy as heat.", "HS-PS1-4"),
    ("What is genetic drift?", ["Purposeful mutation", "Random changes in gene frequency in a population", "Evolution by selection", "DNA replication"], "B", 4, "Random allele frequency changes.", "HS-LS4-3"),
    ("What does E=mc² mean?", ["Force equals mass times acceleration", "Energy equals mass times speed of light squared", "Entropy equals mass times constant", "Voltage equals mass times charge"], "B", 3, "Einstein's mass-energy equivalence.", "HS-PS4-5"),
    ("What is the function of ATP?", ["Store genetic info", "Transport oxygen", "Provide cellular energy", "Build muscles"], "C", 3, "ATP = energy currency of cells.", "HS-LS1-7"),
    ("What is the pH of stomach acid?", ["1-2", "5-6", "7", "8-9"], "A", 4, "Stomach acid pH ≈ 1.5-3.5, very acidic.", "HS-PS1-2"),
    ("What is trophic level?", ["A disease", "A position in the food chain", "A type of biome", "An organ system"], "B", 4, "Trophic levels: producers, primary consumers, etc.", "HS-LS2-4"),
]

QUESTIONS[("9-12", "General Knowledge")] = [
    ("What year did the Berlin Wall fall?", ["1985", "1987", "1989", "1991"], "C", 3, "The Berlin Wall fell in 1989.", "GK.912.1"),
    ("What is the European Union?", ["A military alliance", "A political and economic union of European countries", "A sports organization", "A trading company"], "B", 3, "EU = political/economic union.", "GK.912.3"),
    ("Who is known as the father of modern physics?", ["Newton", "Einstein", "Bohr", "Feynman"], "B", 3, "Einstein's contributions were foundational.", "GK.912.2"),
    ("What is 'inflation'?", ["Money losing value", "General increase in prices over time", "Unemployment rising", "Stock market crash"], "B", 3, "Inflation = purchasing power decreases.", "GK.912.3"),
    ("What is the significance of 1776?", ["French Revolution", "American Declaration of Independence", "End of WWI", "Industrial Revolution"], "B", 2, "1776 = US independence declared.", "GK.912.1"),
    ("What is 'photovoltaic' energy?", ["Wind power", "Solar energy converted to electricity", "Nuclear energy", "Hydro power"], "B", 4, "Solar panels = photovoltaic cells.", "GK.912.4"),
    ("What is the 'Internet of Things' (IoT)?", ["Social media", "Network of connected everyday devices", "A search engine", "Cloud storage"], "B", 4, "IoT = smart interconnected devices.", "GK.912.5"),
    ("What economic system is based on private ownership?", ["Communism", "Socialism", "Capitalism", "Feudalism"], "C", 3, "Capitalism = private property + free markets.", "GK.912.3"),
    ("What is the 'greenhouse effect'?", ["Growing plants in a greenhouse", "Atmospheric gases trapping heat", "Acid rain", "Ozone depletion"], "B", 3, "CO₂ etc. trap heat in the atmosphere.", "GK.912.4"),
    ("What treaty ended World War I?", ["Treaty of Paris", "Treaty of Versailles", "Treaty of Vienna", "Treaty of Rome"], "B", 4, "Treaty of Versailles, 1919.", "GK.912.1"),
    ("What is 'cybersecurity'?", ["Antivirus software only", "Protecting systems and data from digital attacks", "A type of programming", "Internet speed"], "B", 3, "Protection against cyber threats.", "GK.912.5"),
    ("What is CRISPR used for?", ["Space travel", "Gene editing", "Cryptocurrency", "AI training"], "B", 5, "CRISPR = genome editing tool.", "GK.912.5"),
]


# ═══════════════════════════════════════════════════════════════════
#  SEED LOGIC
# ═══════════════════════════════════════════════════════════════════

def seed():
    total = 0
    batch_count = 0
    batch = db.batch()
    labels = ["A", "B", "C", "D"]

    for (grade_band, subject), question_list in QUESTIONS.items():
        for q_data in question_list:
            text, options, correct, difficulty, explanation, *rest = q_data
            standard = rest[0] if rest else ""

            option_objs = [
                {"label": labels[i], "text": opt_text, "text_ar": ""}
                for i, opt_text in enumerate(options)
            ]

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

            if batch_count >= 400:
                print(f"  Committing batch ({batch_count} docs)...")
                batch.commit()
                batch = db.batch()
                batch_count = 0
                time.sleep(0.5)

    if batch_count > 0:
        print(f"  Committing final batch ({batch_count} docs)...")
        batch.commit()

    print(f"\n✅ Seeded {total} new questions total.\n")

    # Summary
    print("📊 Summary by Grade Band × Subject:")
    for band in ["pre-k", "k-2", "3-5", "6-8", "9-12"]:
        print(f"\n  ─── {band.upper()} ───")
        for subj in ["Mathematics", "Reading", "Language Usage", "Science", "General Knowledge"]:
            count = len(QUESTIONS.get((band, subj), []))
            print(f"    {subj:20s}  {count} questions")


if __name__ == "__main__":
    print("🎯 Seeding expanded question bank v3...\n")
    seed()
