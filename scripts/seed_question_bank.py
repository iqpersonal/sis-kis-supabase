"""
Seed the NWEA-style Question Bank with ~200 MCQ questions.
Covers all 5 grade bands × 5 subjects × varying difficulty levels (1-5).

Usage:
    python scripts/seed_question_bank.py
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

# ──────────────────────────────────────────────────────────────────
# Question Bank Data
# Each entry: (text, options[A,B,C,D], correct, difficulty, explanation, standard?)
# ──────────────────────────────────────────────────────────────────

QUESTIONS = {
    # ──────────────────────────────────────────────────────────
    # PRE-K (Ages 3–5)
    # ──────────────────────────────────────────────────────────
    ("pre-k", "Mathematics"): [
        ("How many apples are there? 🍎🍎🍎", ["2", "3", "4", "5"], "B", 1, "Count each apple: 1, 2, 3.", "PK.CC.1"),
        ("What shape is a ball?", ["Square", "Triangle", "Circle", "Rectangle"], "C", 1, "A ball is round like a circle.", "PK.G.1"),
        ("Which number comes after 2?", ["1", "3", "4", "5"], "B", 1, "We count 1, 2, 3 — so 3 comes after 2.", "PK.CC.2"),
        ("How many fingers do you have on one hand?", ["3", "4", "5", "6"], "C", 2, "Count your fingers: 1, 2, 3, 4, 5.", "PK.CC.1"),
        ("Which group has MORE? Group A: ⭐⭐ Group B: ⭐⭐⭐⭐", ["Group A", "Group B", "They are the same", "Cannot tell"], "B", 2, "Group B has 4 stars, Group A has 2. 4 is more than 2.", "PK.CC.6"),
        ("What shape has 3 sides?", ["Circle", "Square", "Triangle", "Rectangle"], "C", 2, "A triangle has exactly 3 sides.", "PK.G.2"),
        ("What number is missing? 1, 2, __, 4, 5", ["0", "3", "6", "7"], "B", 3, "The numbers go in order: 1, 2, 3, 4, 5.", "PK.CC.2"),
        ("Which is the biggest number?", ["3", "1", "5", "2"], "C", 3, "5 is bigger than 3, 2, and 1.", "PK.CC.7"),
    ],
    ("pre-k", "Reading"): [
        ("Which letter makes the sound 'mmm'?", ["B", "M", "S", "T"], "B", 1, "The letter M makes the 'mmm' sound.", "PK.RF.2"),
        ("What letter does 'cat' start with?", ["A", "B", "C", "D"], "C", 1, "Cat starts with the letter C.", "PK.RF.3"),
        ("Which word rhymes with 'cat'?", ["Dog", "Hat", "Cup", "Sun"], "B", 2, "Hat and cat both end with '-at'.", "PK.RF.2"),
        ("What does a 'dog' say?", ["Moo", "Meow", "Woof", "Quack"], "C", 1, "A dog says 'Woof!'", "PK.RL.1"),
        ("Which picture shows a 'book'?", ["A ball", "A book", "A tree", "A car"], "B", 1, "A book has pages you can read.", "PK.RI.7"),
        ("How many words are in this sentence: 'I see a cat'?", ["2", "3", "4", "5"], "C", 3, "Count each word: I (1), see (2), a (3), cat (4).", "PK.RF.1"),
        ("Which word starts with the same sound as 'sun'?", ["Moon", "Star", "Sock", "Ball"], "C", 2, "Sock and Sun both start with 'S'.", "PK.RF.2"),
        ("What comes at the end of a sentence?", ["A comma", "A question mark", "A period", "A letter"], "C", 3, "Sentences end with a period (.).", "PK.L.2"),
    ],
    ("pre-k", "Language Usage"): [
        ("What is the color of the sky?", ["Red", "Green", "Blue", "Yellow"], "C", 1, "On a clear day, the sky is blue.", "PK.L.5"),
        ("Which is a fruit?", ["Chair", "Apple", "Table", "Book"], "B", 1, "An apple is a fruit you can eat.", "PK.L.5"),
        ("Fill in: The cat ___ sleeping.", ["am", "is", "are", "be"], "B", 2, "We say 'The cat is sleeping.'", "PK.L.1"),
        ("What is the opposite of 'big'?", ["Tall", "Small", "Wide", "Long"], "B", 2, "Big and small are opposites.", "PK.L.5"),
        ("Which sentence is correct?", ["I has a dog.", "I have a dog.", "I haves a dog.", "I having a dog."], "B", 3, "The correct form is 'I have a dog.'", "PK.L.1"),
        ("What do we use to eat soup?", ["A fork", "A spoon", "A knife", "A plate"], "B", 1, "We use a spoon to eat soup.", "PK.L.5"),
        ("Which word means 'happy'?", ["Sad", "Angry", "Glad", "Tired"], "C", 2, "Glad means happy or joyful.", "PK.L.5"),
        ("How many syllables in 'ba-na-na'?", ["1", "2", "3", "4"], "C", 3, "Ba-na-na has 3 syllables.", "PK.RF.2"),
    ],
    ("pre-k", "Science"): [
        ("What do plants need to grow?", ["Toys", "Water", "Books", "Shoes"], "B", 1, "Plants need water and sunlight to grow.", "PK.LS.1"),
        ("How many legs does a dog have?", ["2", "3", "4", "6"], "C", 1, "Dogs have 4 legs.", "PK.LS.1"),
        ("What do we see in the sky at night?", ["Sun", "Rainbow", "Moon", "Clouds only"], "C", 2, "At night we can see the moon and stars.", "PK.ESS.1"),
        ("Which season is cold and snowy?", ["Summer", "Spring", "Fall", "Winter"], "D", 2, "Winter is the cold, snowy season.", "PK.ESS.2"),
        ("What sense do we use with our eyes?", ["Hearing", "Sight", "Smell", "Touch"], "B", 1, "We use our eyes for sight (seeing).", "PK.LS.1"),
        ("Which animal lives in water?", ["Cat", "Dog", "Fish", "Bird"], "C", 2, "Fish live in water.", "PK.LS.1"),
        ("What happens when ice gets warm?", ["It stays the same", "It melts", "It gets bigger", "It disappears"], "B", 3, "When ice gets warm, it melts into water.", "PK.PS.1"),
        ("Which is alive?", ["Rock", "Chair", "Flower", "Table"], "C", 2, "A flower is a living thing that grows.", "PK.LS.1"),
    ],
    ("pre-k", "General Knowledge"): [
        ("What meal do we eat in the morning?", ["Lunch", "Dinner", "Breakfast", "Snack"], "C", 1, "Breakfast is the first meal of the day.", "PK.GK.1"),
        ("How many days are in a week?", ["5", "6", "7", "8"], "C", 2, "There are 7 days in a week.", "PK.GK.1"),
        ("What do you wear on your feet?", ["Hat", "Gloves", "Shoes", "Scarf"], "C", 1, "We wear shoes on our feet.", "PK.GK.1"),
        ("What color do you get when you mix red and yellow?", ["Green", "Orange", "Purple", "Brown"], "B", 3, "Red + Yellow = Orange.", "PK.GK.2"),
        ("Where do people go when they are sick?", ["School", "Park", "Hospital", "Library"], "C", 2, "People go to a hospital or doctor when sick.", "PK.GK.1"),
        ("Which person helps put out fires?", ["Teacher", "Doctor", "Firefighter", "Chef"], "C", 1, "Firefighters help put out fires.", "PK.GK.1"),
        ("What do bees make?", ["Milk", "Honey", "Bread", "Juice"], "B", 2, "Bees make honey.", "PK.GK.2"),
        ("What shape is a stop sign?", ["Circle", "Triangle", "Square", "Octagon"], "D", 3, "A stop sign is an octagon (8 sides).", "PK.GK.2"),
    ],

    # ──────────────────────────────────────────────────────────
    # K–2 (Ages 5–8)
    # ──────────────────────────────────────────────────────────
    ("k-2", "Mathematics"): [
        ("What is 5 + 3?", ["6", "7", "8", "9"], "C", 1, "5 + 3 = 8.", "1.OA.1"),
        ("What is 12 - 4?", ["6", "7", "8", "9"], "C", 2, "12 - 4 = 8.", "1.OA.1"),
        ("What is 7 + 6?", ["11", "12", "13", "14"], "C", 2, "7 + 6 = 13.", "2.OA.1"),
        ("How many sides does a rectangle have?", ["3", "4", "5", "6"], "B", 1, "A rectangle has 4 sides.", "1.G.1"),
        ("What is 15 + 25?", ["35", "40", "45", "50"], "B", 2, "15 + 25 = 40.", "2.NBT.5"),
        ("Which number is even: 7, 8, 9, 11?", ["7", "8", "9", "11"], "B", 3, "8 is even because it can be divided into 2 equal groups.", "2.OA.3"),
        ("What is 48 + 36?", ["74", "82", "84", "86"], "C", 3, "48 + 36 = 84.", "2.NBT.5"),
        ("What time is it when the hour hand is on 3 and minute hand is on 12?", ["12:03", "3:00", "3:12", "12:30"], "B", 2, "When the hour hand is on 3 and minute hand on 12, it's 3:00.", "1.MD.3"),
        ("There are 4 bags with 5 marbles each. How many marbles in total?", ["9", "15", "20", "25"], "C", 4, "4 × 5 = 20 marbles.", "2.OA.4"),
        ("What is the value of the 3 in 345?", ["3", "30", "300", "3000"], "C", 4, "The 3 is in the hundreds place, so it equals 300.", "2.NBT.1"),
    ],
    ("k-2", "Reading"): [
        ("In the sentence 'The big dog ran fast,' what is the dog doing?", ["Sleeping", "Running", "Eating", "Playing"], "B", 1, "The sentence says the dog 'ran fast.'", "RL.1.1"),
        ("What is the main idea of a story about a lost puppy finding its way home?", ["Cooking food", "Going to school", "Finding the way home", "Playing sports"], "C", 2, "The story is mainly about a puppy finding its way home.", "RL.1.2"),
        ("What does the word 'enormous' mean?", ["Tiny", "Very big", "Fast", "Colorful"], "B", 2, "Enormous means very big or huge.", "L.2.4"),
        ("Which is a fiction book?", ["A book about real animals", "A fairy tale about a magic dragon", "A cookbook", "A dictionary"], "B", 2, "Fairy tales with magic dragons are fiction (made up).", "RL.1.5"),
        ("What part of a book tells what the story is about in a few words?", ["Index", "Table of contents", "Title", "Glossary"], "C", 1, "The title tells what the story is about.", "RI.1.5"),
        ("In 'Sam was sad because his toy broke,' why was Sam sad?", ["He was tired", "His toy broke", "It was raining", "He missed lunch"], "B", 2, "The text says Sam was sad BECAUSE his toy broke.", "RL.1.1"),
        ("What happens FIRST in a story with a beginning, middle, and end?", ["The problem is solved", "The characters are introduced", "The climax happens", "The ending"], "B", 3, "Characters are introduced at the beginning of a story.", "RL.2.5"),
        ("Which word is a synonym for 'happy'?", ["Angry", "Joyful", "Afraid", "Bored"], "B", 3, "Joyful means the same thing as happy.", "L.2.5"),
    ],
    ("k-2", "Language Usage"): [
        ("Which sentence starts with a capital letter?", ["the cat sat.", "The cat sat.", "the Cat sat.", "thE cat sat."], "B", 1, "Sentences should start with a capital letter: 'The cat sat.'", "L.1.2"),
        ("What goes at the end of a question?", ["Period (.)", "Exclamation mark (!)", "Question mark (?)", "Comma (,)"], "C", 1, "Questions end with a question mark (?).", "L.1.2"),
        ("Which is a noun?", ["Run", "Beautiful", "Teacher", "Quickly"], "C", 2, "A noun is a person, place, or thing. Teacher is a person.", "L.1.1"),
        ("Choose the correct word: 'She ___ to school every day.'", ["go", "goes", "going", "gone"], "B", 2, "She goes — third person singular uses 'goes.'", "L.1.1"),
        ("Which word is a verb?", ["Book", "Happy", "Jump", "Blue"], "C", 2, "A verb is an action word. Jump is something you do.", "L.1.1"),
        ("What is the plural of 'box'?", ["Boxs", "Boxes", "Boxies", "Box"], "B", 3, "Words ending in x add 'es': box → boxes.", "L.2.1"),
        ("Which sentence uses the correct punctuation?", ["I like cats dogs and birds.", "I like cats, dogs, and birds.", "I like, cats dogs and birds.", "I like cats dogs, and, birds."], "B", 4, "Use commas to separate items in a list.", "L.2.2"),
        ("Choose the correct word: 'The two boys ___ playing.'", ["is", "was", "are", "has"], "C", 3, "Two boys is plural, so we use 'are.'", "L.1.1"),
    ],
    ("k-2", "Science"): [
        ("What do plants need besides water to grow?", ["Toys", "Music", "Sunlight", "Paper"], "C", 1, "Plants need water AND sunlight to grow.", "1-LS1-1"),
        ("What is the largest organ in your body?", ["Heart", "Brain", "Skin", "Lungs"], "C", 3, "Your skin is your largest organ.", "1-LS1-1"),
        ("Which force pulls things down to the ground?", ["Magnetism", "Friction", "Gravity", "Wind"], "C", 2, "Gravity pulls everything down toward Earth.", "K-PS2-1"),
        ("What do caterpillars turn into?", ["Ants", "Worms", "Butterflies", "Beetles"], "C", 2, "Caterpillars metamorphose into butterflies.", "2-LS4-1"),
        ("Which is NOT a state of matter?", ["Solid", "Liquid", "Gas", "Energy"], "D", 3, "Solid, liquid, and gas are states of matter. Energy is not.", "2-PS1-1"),
        ("What is the Sun?", ["A planet", "A star", "A moon", "A comet"], "B", 2, "The Sun is a star — it produces its own light and heat.", "1-ESS1-1"),
        ("What causes day and night?", ["The Moon moving", "The Sun moving", "Earth spinning", "Clouds blocking the Sun"], "C", 3, "Earth spinning (rotating) on its axis causes day and night.", "1-ESS1-1"),
        ("How do animals in cold places stay warm?", ["Thick fur or feathers", "Wearing clothes", "Staying awake", "Eating ice"], "A", 3, "Animals have thick fur, feathers, or blubber to stay warm.", "2-LS4-1"),
    ],
    ("k-2", "General Knowledge"): [
        ("Which continent do we see kangaroos?", ["Africa", "Asia", "Australia", "Europe"], "C", 2, "Kangaroos live in Australia.", "GK.K2.1"),
        ("How many months are in a year?", ["10", "11", "12", "13"], "C", 1, "There are 12 months in a year.", "GK.K2.1"),
        ("What shape is Earth?", ["Flat", "Square", "Sphere (round ball)", "Triangle"], "C", 2, "Earth is shaped like a sphere (a round ball).", "GK.K2.2"),
        ("What do we call the person who leads a country?", ["Teacher", "Doctor", "President or King", "Chef"], "C", 2, "A president or king/queen is the leader of a country.", "GK.K2.1"),
        ("Which ocean is the biggest?", ["Atlantic", "Indian", "Arctic", "Pacific"], "D", 3, "The Pacific Ocean is the largest ocean on Earth.", "GK.K2.2"),
        ("In which direction does the Sun rise?", ["West", "North", "East", "South"], "C", 2, "The Sun rises in the East.", "GK.K2.2"),
        ("How many continents are there?", ["5", "6", "7", "8"], "C", 3, "There are 7 continents on Earth.", "GK.K2.2"),
        ("What do we celebrate on the first day of January?", ["Independence Day", "New Year's Day", "Christmas", "Valentine's Day"], "B", 1, "January 1st is New Year's Day.", "GK.K2.1"),
    ],

    # ──────────────────────────────────────────────────────────
    # 3–5 (Ages 8–11)
    # ──────────────────────────────────────────────────────────
    ("3-5", "Mathematics"): [
        ("What is 6 × 7?", ["36", "42", "48", "54"], "B", 2, "6 × 7 = 42.", "3.OA.7"),
        ("What is 1/2 + 1/4?", ["1/6", "2/4", "3/4", "1/3"], "C", 3, "1/2 = 2/4, so 2/4 + 1/4 = 3/4.", "4.NF.3"),
        ("What is the perimeter of a rectangle with length 8 and width 3?", ["11", "22", "24", "32"], "B", 2, "Perimeter = 2 × (8 + 3) = 2 × 11 = 22.", "3.MD.8"),
        ("What is 0.5 as a fraction?", ["1/3", "1/4", "1/2", "1/5"], "C", 2, "0.5 = 5/10 = 1/2.", "4.NF.6"),
        ("Round 4,567 to the nearest hundred.", ["4,500", "4,600", "4,570", "5,000"], "B", 3, "4,567 rounds to 4,600 (67 ≥ 50).", "3.NBT.1"),
        ("What is the area of a square with side 9 cm?", ["18 cm²", "36 cm²", "81 cm²", "72 cm²"], "C", 3, "Area = side × side = 9 × 9 = 81 cm².", "4.MD.3"),
        ("Which fraction is equivalent to 2/3?", ["3/4", "4/6", "4/5", "5/6"], "B", 3, "2/3 = 4/6 (multiply both by 2).", "3.NF.3"),
        ("What is 345 × 12?", ["3,940", "4,000", "4,140", "4,240"], "C", 4, "345 × 12 = 345 × 10 + 345 × 2 = 3,450 + 690 = 4,140.", "5.NBT.5"),
        ("What is 3/5 of 40?", ["12", "20", "24", "30"], "C", 4, "3/5 × 40 = (40 ÷ 5) × 3 = 8 × 3 = 24.", "5.NF.4"),
        ("If a box has 144 items and you split them into 12 equal groups, how many per group?", ["10", "12", "14", "16"], "B", 3, "144 ÷ 12 = 12 items per group.", "4.NBT.6"),
    ],
    ("3-5", "Reading"): [
        ("What is the 'setting' of a story?", ["The main character", "Where and when it takes place", "The problem", "The solution"], "B", 1, "Setting is where and when a story takes place.", "RL.3.5"),
        ("What does 'theme' mean in a story?", ["The main character's name", "The lesson or message", "The title", "The author's biography"], "B", 2, "The theme is the central lesson or message of a story.", "RL.4.2"),
        ("What is the author's purpose if they write a book to make you laugh?", ["Inform", "Persuade", "Entertain", "Describe"], "C", 2, "Writing to make you laugh is entertaining.", "RI.4.8"),
        ("Which sentence uses a simile?", ["The sun was hot.", "The sun was like a ball of fire.", "The sun set.", "The sun was yellow."], "B", 3, "Similes compare using 'like' or 'as': 'like a ball of fire.'", "RL.4.4"),
        ("What does 'infer' mean?", ["To copy text", "To guess using clues", "To read aloud", "To summarize"], "B", 3, "Inference means making a logical guess based on clues in the text.", "RI.4.1"),
        ("When comparing two texts about the same topic, you look for:", ["Same pictures", "Similarities and differences in information", "Same page count", "Same author"], "B", 3, "Comparing texts means finding similarities and differences.", "RI.5.9"),
        ("What is a 'point of view' in a story?", ["The setting", "Who is telling the story and how", "The ending", "The title"], "B", 4, "Point of view is the perspective from which a story is told.", "RL.5.6"),
        ("What does the prefix 'un-' mean in 'unhappy'?", ["Very", "Not", "Again", "Before"], "B", 2, "The prefix 'un-' means 'not': unhappy = not happy.", "L.3.4"),
    ],
    ("3-5", "Language Usage"): [
        ("What type of sentence asks a question?", ["Declarative", "Exclamatory", "Interrogative", "Imperative"], "C", 2, "An interrogative sentence asks a question.", "L.3.1"),
        ("Which word is an adjective in: 'The tall tree fell.'?", ["The", "tall", "tree", "fell"], "B", 2, "Tall describes the tree, so it's an adjective.", "L.3.1"),
        ("What is the past tense of 'run'?", ["Runned", "Running", "Ran", "Runs"], "C", 2, "The past tense of 'run' is 'ran.'", "L.3.1"),
        ("Which sentence uses a comma correctly?", ["I ate, pizza.", "I ate pizza, salad, and cake.", "I, ate pizza salad and cake.", "I ate pizza salad, and cake."], "B", 3, "Commas separate items in a list: pizza, salad, and cake.", "L.3.2"),
        ("'Their,' 'there,' and 'they're' — which means 'they are'?", ["Their", "There", "They're", "Thier"], "C", 3, "They're is the contraction of 'they are.'", "L.4.1"),
        ("Which is a compound sentence?", ["I like cats.", "I like cats and dogs.", "I like cats, but I love dogs.", "Running fast."], "C", 4, "A compound sentence joins two independent clauses: 'I like cats, but I love dogs.'", "L.4.1"),
        ("What is a synonym for 'difficult'?", ["Easy", "Simple", "Challenging", "Quick"], "C", 2, "Challenging means the same as difficult.", "L.4.5"),
        ("Which word needs an apostrophe? 'The dogs bone is under the table.'", ["dogs", "bone", "under", "table"], "A", 3, "It should be 'dog's bone' (possessive).", "L.3.2"),
    ],
    ("3-5", "Science"): [
        ("What are the three states of matter?", ["Solid, liquid, gas", "Hot, cold, warm", "Big, medium, small", "Metal, plastic, wood"], "A", 1, "Matter exists as solids, liquids, and gases.", "3-PS1-1"),
        ("Which planet is closest to the Sun?", ["Venus", "Earth", "Mercury", "Mars"], "C", 2, "Mercury is the closest planet to the Sun.", "3-ESS1-1"),
        ("What type of energy does a battery store?", ["Heat energy", "Chemical energy", "Light energy", "Sound energy"], "B", 3, "Batteries store chemical energy that converts to electrical energy.", "4-PS3-2"),
        ("What is the process by which plants make their own food?", ["Respiration", "Digestion", "Photosynthesis", "Evaporation"], "C", 3, "Photosynthesis is how plants use sunlight to make food.", "5-LS1-1"),
        ("In a food chain, what is a 'producer'?", ["An animal that eats plants", "A plant that makes its own food", "An animal that eats other animals", "A decomposer"], "B", 2, "Producers (plants) make their own food through photosynthesis.", "5-LS2-1"),
        ("What causes earthquakes?", ["Wind", "Rain", "Movement of tectonic plates", "Temperature changes"], "C", 3, "Earthquakes happen when tectonic plates shift and collide.", "4-ESS2-2"),
        ("What is the water cycle?", ["Water flowing in rivers", "Water evaporating, condensing, and precipitating", "Water freezing", "Water being filtered"], "B", 3, "The water cycle is evaporation → condensation → precipitation.", "3-ESS2-1"),
        ("Which force slows down a sliding object?", ["Gravity", "Friction", "Magnetism", "Buoyancy"], "B", 2, "Friction acts against motion and slows objects down.", "3-PS2-1"),
    ],
    ("3-5", "General Knowledge"): [
        ("Which is the longest river in the world?", ["Amazon", "Nile", "Mississippi", "Yangtze"], "B", 2, "The Nile River is the longest river in the world.", "GK.35.1"),
        ("What is the capital of France?", ["London", "Berlin", "Paris", "Rome"], "C", 1, "Paris is the capital of France.", "GK.35.1"),
        ("What instrument has 88 keys?", ["Guitar", "Violin", "Piano", "Drums"], "C", 2, "A standard piano has 88 keys.", "GK.35.2"),
        ("Who wrote the play 'Romeo and Juliet'?", ["Charles Dickens", "William Shakespeare", "Mark Twain", "Jane Austen"], "B", 3, "William Shakespeare wrote Romeo and Juliet.", "GK.35.2"),
        ("How many planets are in our solar system?", ["7", "8", "9", "10"], "B", 2, "There are 8 planets in our solar system.", "GK.35.3"),
        ("What year did humans first walk on the Moon?", ["1959", "1965", "1969", "1972"], "C", 3, "Neil Armstrong walked on the Moon on July 20, 1969.", "GK.35.3"),
        ("What is the hardest natural material on Earth?", ["Gold", "Iron", "Diamond", "Quartz"], "C", 3, "Diamond is the hardest naturally occurring material.", "GK.35.3"),
        ("What do we call a scientist who studies fossils?", ["Biologist", "Paleontologist", "Astronomer", "Chemist"], "B", 4, "A paleontologist studies fossils and ancient life.", "GK.35.3"),
    ],

    # ──────────────────────────────────────────────────────────
    # 6–8 (Ages 11–14)
    # ──────────────────────────────────────────────────────────
    ("6-8", "Mathematics"): [
        ("What is the value of x: 3x + 5 = 20?", ["3", "5", "7", "15"], "B", 2, "3x = 15, x = 5.", "6.EE.7"),
        ("What is 25% of 80?", ["15", "20", "25", "40"], "B", 2, "25% × 80 = 0.25 × 80 = 20.", "6.RP.3"),
        ("What is the area of a triangle with base 10 and height 6?", ["16", "30", "60", "36"], "B", 3, "Area = ½ × base × height = ½ × 10 × 6 = 30.", "6.G.1"),
        ("Simplify: 3/4 ÷ 1/2", ["3/8", "3/2", "1/2", "3/4"], "B", 3, "3/4 ÷ 1/2 = 3/4 × 2/1 = 6/4 = 3/2.", "6.NS.1"),
        ("What is the slope of the line y = 3x + 2?", ["2", "3", "5", "6"], "B", 3, "In y = mx + b, the slope m = 3.", "8.F.3"),
        ("If a shirt costs $40 and is 30% off, what is the sale price?", ["$10", "$12", "$28", "$30"], "C", 3, "30% of 40 = $12 discount. $40 - $12 = $28.", "7.RP.3"),
        ("What is the volume of a rectangular prism: l=5, w=3, h=4?", ["12", "30", "47", "60"], "D", 3, "V = l × w × h = 5 × 3 × 4 = 60.", "7.G.6"),
        ("Solve: -8 + 3 × (-2) = ?", ["10", "-14", "-2", "-10"], "B", 4, "Order of operations: 3 × (-2) = -6, then -8 + (-6) = -14.", "7.NS.1"),
        ("What is √144?", ["10", "11", "12", "14"], "C", 2, "12 × 12 = 144, so √144 = 12.", "8.EE.2"),
        ("What is the probability of rolling a 3 on a standard die?", ["1/2", "1/3", "1/4", "1/6"], "D", 2, "A die has 6 faces, so P(3) = 1/6.", "7.SP.5"),
    ],
    ("6-8", "Reading"): [
        ("What does 'analyze' mean in reading?", ["To read quickly", "To examine closely and in detail", "To write a summary", "To memorize"], "B", 2, "Analyze means to examine something closely to understand it.", "RL.6.1"),
        ("What is an 'unreliable narrator'?", ["A narrator who lies or has a biased perspective", "A narrator who speaks multiple languages", "A third-person narrator", "A narrator who summarizes"], "A", 3, "An unreliable narrator may have a biased or limited perspective.", "RL.7.6"),
        ("What is the difference between 'fact' and 'opinion'?", ["Facts are longer than opinions", "Facts can be proven; opinions are personal beliefs", "There is no difference", "Opinions are always in newspapers"], "B", 2, "A fact can be proven true; an opinion is a personal belief.", "RI.6.8"),
        ("What literary device is used in: 'The wind howled through the trees'?", ["Simile", "Metaphor", "Personification", "Hyperbole"], "C", 3, "Personification gives human qualities (howling) to non-human things (wind).", "RL.6.4"),
        ("What is 'context clues'?", ["The index of a book", "Words around an unknown word that help you guess its meaning", "A type of dictionary", "A reading strategy of skipping words"], "B", 2, "Context clues are surrounding words that help define unknown words.", "L.6.4"),
        ("What is a 'thesis statement'?", ["The first sentence of any paragraph", "The main argument or point of an essay", "A question at the end", "A bibliography entry"], "B", 3, "A thesis statement presents the main argument of an essay.", "W.6.1"),
        ("What is the meaning of 'benevolent'?", ["Mean", "Kind and generous", "Cautious", "Intelligent"], "B", 4, "Benevolent means well-meaning, kind, and generous.", "L.8.4"),
        ("Which of these is an example of irony?", ["A fire station burns down", "A dog barks at a cat", "The weather is hot in summer", "A student studies for a test"], "A", 4, "A fire station burning down is ironic — the opposite of what's expected.", "RL.8.6"),
    ],
    ("6-8", "Language Usage"): [
        ("Which sentence uses 'affect' correctly?", ["The affect was positive.", "The rain will affect the game.", "He had a good affect on her.", "The affect of the medicine worked."], "B", 3, "Affect is a verb meaning 'to influence': rain will affect the game.", "L.6.1"),
        ("What is a 'complex sentence'?", ["A sentence with two subjects", "A sentence with an independent and dependent clause", "A very long sentence", "A sentence with many adjectives"], "B", 3, "A complex sentence has an independent clause + a dependent clause.", "L.7.1"),
        ("Choose the correct word: 'Between you and ___.'", ["I", "me", "myself", "mine"], "B", 3, "'Between' is a preposition; use the object pronoun 'me.'", "L.6.1"),
        ("What is a 'dangling modifier'?", ["A very long adjective", "A modifying phrase with no clear subject to modify", "A type of adverb", "An exclamation mark"], "B", 4, "A dangling modifier is a phrase that doesn't logically attach to the intended word.", "L.7.1"),
        ("Which transition word shows contrast?", ["Furthermore", "Therefore", "However", "Additionally"], "C", 2, "'However' shows a contrast between ideas.", "W.6.2"),
        ("What is 'parallel structure'?", ["Repeating a sentence", "Using the same grammatical form for similar ideas", "Writing in two columns", "Using synonyms"], "B", 4, "Parallel structure means using consistent grammatical patterns.", "L.7.1"),
        ("Which is correct: 'fewer' or 'less'? '___ people came today.'", ["Less", "Fewer", "Both are correct", "Neither"], "B", 3, "Use 'fewer' for countable nouns (people). Use 'less' for uncountable.", "L.6.1"),
        ("What punctuation separates items in a list when the items already contain commas?", ["Colons", "Periods", "Semicolons", "Dashes"], "C", 4, "Semicolons separate list items that already contain commas.", "L.8.2"),
    ],
    ("6-8", "Science"): [
        ("What is the basic unit of life?", ["Atom", "Cell", "Molecule", "Organ"], "B", 1, "The cell is the basic structural and functional unit of life.", "MS-LS1-1"),
        ("What is the chemical formula for water?", ["H2O", "CO2", "NaCl", "O2"], "A", 1, "Water is H2O — two hydrogen atoms and one oxygen atom.", "MS-PS1-1"),
        ("What is the difference between speed and velocity?", ["There is no difference", "Velocity includes direction", "Speed includes direction", "Speed is faster"], "B", 3, "Velocity = speed + direction.", "MS-PS2-2"),
        ("Which organelle is the 'powerhouse' of the cell?", ["Nucleus", "Ribosome", "Mitochondria", "Cell wall"], "C", 2, "Mitochondria produce energy (ATP) for the cell.", "MS-LS1-2"),
        ("What layer of Earth's atmosphere do we live in?", ["Stratosphere", "Mesosphere", "Troposphere", "Thermosphere"], "C", 3, "We live in the troposphere, the lowest atmospheric layer.", "MS-ESS2-6"),
        ("What is Newton's First Law of Motion?", ["F = ma", "Every action has an equal and opposite reaction", "An object at rest stays at rest unless acted on by a force", "Energy cannot be created or destroyed"], "C", 3, "Newton's 1st Law: an object at rest stays at rest (inertia).", "MS-PS2-1"),
        ("What is the pH of a neutral substance?", ["0", "5", "7", "14"], "C", 3, "A neutral pH is 7. Below 7 is acidic, above 7 is basic.", "MS-PS1-2"),
        ("How do vaccines protect us?", ["They kill all bacteria", "They train the immune system to recognize pathogens", "They make us stronger", "They add vitamins"], "B", 4, "Vaccines expose the immune system to weakened pathogens so it can fight them later.", "MS-LS1-8"),
    ],
    ("6-8", "General Knowledge"): [
        ("What is the largest desert in the world?", ["Sahara", "Gobi", "Antarctic", "Arabian"], "C", 3, "Antarctica is the largest desert (cold desert) by area.", "GK.68.1"),
        ("What does GDP stand for?", ["General Data Production", "Gross Domestic Product", "Global Development Plan", "Government Debt Payment"], "B", 3, "GDP = Gross Domestic Product, the total value of goods and services produced.", "GK.68.2"),
        ("Who painted the Mona Lisa?", ["Michelangelo", "Leonardo da Vinci", "Pablo Picasso", "Vincent van Gogh"], "B", 2, "Leonardo da Vinci painted the Mona Lisa.", "GK.68.2"),
        ("What is the tallest mountain in the world?", ["K2", "Kilimanjaro", "Mount Everest", "Mont Blanc"], "C", 2, "Mount Everest is the tallest mountain at 8,849 meters.", "GK.68.1"),
        ("What ancient civilization built the pyramids?", ["Romans", "Greeks", "Egyptians", "Persians"], "C", 2, "The ancient Egyptians built the pyramids.", "GK.68.3"),
        ("What is the United Nations (UN)?", ["A sports organization", "An international organization promoting peace and cooperation", "A bank", "A space agency"], "B", 3, "The UN is an international body promoting peace, security, and cooperation.", "GK.68.3"),
        ("What is the speed of light approximately?", ["300 km/s", "3,000 km/s", "300,000 km/s", "3,000,000 km/s"], "C", 4, "Light travels at approximately 300,000 km/s.", "GK.68.4"),
        ("Which country has the largest population?", ["USA", "India", "China", "Indonesia"], "B", 3, "India surpassed China as the most populous country.", "GK.68.1"),
    ],

    # ──────────────────────────────────────────────────────────
    # 9–12 (Ages 14–18)
    # ──────────────────────────────────────────────────────────
    ("9-12", "Mathematics"): [
        ("Solve for x: 2x² - 8 = 0", ["x = ±2", "x = ±4", "x = 2", "x = 4"], "A", 2, "2x² = 8, x² = 4, x = ±2.", "HSA.REI.4"),
        ("What is the derivative of f(x) = 3x²?", ["3x", "6x", "6x²", "9x"], "B", 3, "Using the power rule: d/dx(3x²) = 6x.", "HSF.IF.6"),
        ("What is the standard deviation a measure of?", ["Central tendency", "Data spread/variability", "Median", "Mode"], "B", 3, "Standard deviation measures how spread out data points are.", "HSS.ID.2"),
        ("What is log₁₀(1000)?", ["2", "3", "4", "10"], "B", 2, "10³ = 1000, so log₁₀(1000) = 3.", "HSF.BF.5"),
        ("In a right triangle, if one leg is 3 and the other is 4, what is the hypotenuse?", ["5", "6", "7", "8"], "A", 2, "3² + 4² = 9 + 16 = 25 = 5².", "HSG.SRT.8"),
        ("What is the integral of 2x dx?", ["x", "x²", "x² + C", "2x² + C"], "C", 4, "∫2x dx = x² + C.", "HSF.IF.6"),
        ("What is sin(30°)?", ["0", "1/2", "√2/2", "√3/2"], "B", 3, "sin(30°) = 1/2.", "HSG.SRT.6"),
        ("What is the sum of the interior angles of a hexagon?", ["360°", "540°", "720°", "900°"], "C", 3, "(6-2) × 180° = 720°.", "HSG.CO.11"),
        ("What is the compound interest formula?", ["A = P + rt", "A = P(1 + r/n)^(nt)", "A = Prt", "A = P × r × t"], "B", 4, "Compound interest: A = P(1 + r/n)^(nt).", "HSF.LE.1"),
        ("What is the determinant of the matrix [[2,3],[1,4]]?", ["5", "6", "8", "11"], "A", 4, "det = (2)(4) - (3)(1) = 8 - 3 = 5.", "HSN.VM.12"),
    ],
    ("9-12", "Reading"): [
        ("What is 'rhetoric'?", ["A type of poem", "The art of persuasive speaking/writing", "A figure of speech", "A literary time period"], "B", 2, "Rhetoric is the art of effective or persuasive language.", "RI.9.6"),
        ("What does 'juxtaposition' mean in literature?", ["Repeating a phrase", "Placing two things side by side for contrast", "Using exaggeration", "A type of metaphor"], "B", 3, "Juxtaposition places contrasting elements side by side for effect.", "RL.9.4"),
        ("What is 'tone' in a piece of writing?", ["The volume of reading", "The author's attitude toward the subject", "The topic sentence", "The setting"], "B", 2, "Tone reflects the author's attitude toward the subject.", "RL.9.4"),
        ("What is an 'allegory'?", ["A short story with a moral", "A story with a hidden symbolic meaning", "A type of essay", "A humorous poem"], "B", 4, "An allegory is a narrative where characters/events symbolize deeper meanings.", "RL.11.4"),
        ("What is 'ethos' in persuasive writing?", ["Emotional appeal", "Logical appeal", "Credibility appeal", "Narrative appeal"], "C", 3, "Ethos establishes the writer's credibility and trustworthiness.", "RI.9.6"),
        ("What is the difference between 'denotation' and 'connotation'?", ["They mean the same thing", "Denotation is the literal meaning; connotation is the implied meaning", "Connotation is the literal meaning", "Neither relates to meaning"], "B", 3, "Denotation = dictionary definition. Connotation = emotional/cultural associations.", "L.9.5"),
        ("In Shakespearean plays, what is a 'soliloquy'?", ["A conversation between two characters", "A speech given alone, revealing inner thoughts", "A song", "A stage direction"], "B", 3, "A soliloquy is a character speaking their thoughts aloud while alone.", "RL.9.5"),
        ("What does 'verisimilitude' mean?", ["Very similar", "The appearance of being true or real", "A verse in poetry", "A type of alliteration"], "B", 5, "Verisimilitude means the quality of appearing to be true or real.", "RL.11.4"),
    ],
    ("9-12", "Language Usage"): [
        ("What is a 'clause'?", ["A type of punctuation", "A group of words with a subject and verb", "A single word acting as a noun", "A paragraph structure"], "B", 2, "A clause is a group of words containing a subject and a verb.", "L.9.1"),
        ("Which is correct: 'Who' or 'Whom'? 'To ___ it may concern.'", ["Who", "Whom", "Whose", "Who's"], "B", 3, "'Whom' is used as an object: 'To whom it may concern.'", "L.9.1"),
        ("What is the 'subjunctive mood'?", ["A happy writing style", "A verb form expressing wishes, demands, or hypotheticals", "A type of essay", "Writing in first person"], "B", 4, "Subjunctive mood: 'If I were you...' (hypothetical).", "L.9.1"),
        ("Which sentence avoids the passive voice?", ["The ball was hit by John.", "The test was failed by many.", "John hit the ball.", "The cake was eaten."], "C", 3, "'John hit the ball' is active voice (subject does the action).", "L.9.3"),
        ("What is an 'Oxford comma'?", ["A comma before a quote", "A comma before 'and/or' in a list of three or more items", "A comma after a name", "A comma in British English only"], "B", 3, "The Oxford comma comes before the final conjunction in a list.", "L.9.2"),
        ("What is the purpose of a 'semicolon'?", ["To end a sentence", "To connect two related independent clauses", "To introduce a list", "To show possession"], "B", 3, "Semicolons link two related independent clauses without a conjunction.", "L.9.2"),
        ("Identify the error: 'Each of the students have their book.'", ["Each → Every", "have → has", "their → a", "students → student"], "B", 4, "'Each' is singular, so it should be 'Each of the students has...'", "L.9.1"),
        ("What is 'MLA format'?", ["A type of bibliography only", "A standardized format for academic papers and citations", "A writing style for novels", "A grammar rule book"], "B", 3, "MLA is a widely used format for academic papers and source citations.", "W.9.8"),
    ],
    ("9-12", "Science"): [
        ("What is the powerhouse of the cell?", ["Nucleus", "Ribosome", "Mitochondria", "Golgi apparatus"], "C", 1, "Mitochondria produce ATP, the cell's energy currency.", "HS-LS1-7"),
        ("What is the chemical formula for photosynthesis?", ["6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂", "C₆H₁₂O₆ + 6O₂ → 6CO₂ + 6H₂O", "2H₂ + O₂ → 2H₂O", "NaCl → Na + Cl"], "A", 3, "Photosynthesis: carbon dioxide + water → glucose + oxygen.", "HS-LS1-5"),
        ("What is Avogadro's number?", ["3.14 × 10²³", "6.022 × 10²³", "9.81 × 10²³", "1.602 × 10²³"], "B", 3, "Avogadro's number is 6.022 × 10²³ particles per mole.", "HS-PS1-7"),
        ("What is the relationship between wavelength and frequency?", ["Directly proportional", "Inversely proportional", "No relationship", "They are the same"], "B", 3, "As wavelength increases, frequency decreases (inversely proportional).", "HS-PS4-1"),
        ("What is natural selection?", ["Animals choosing their mates", "Survival and reproduction of organisms best adapted to their environment", "Artificial breeding", "Random evolution"], "B", 3, "Natural selection: organisms with advantageous traits are more likely to survive and reproduce.", "HS-LS4-4"),
        ("What is the ideal gas law?", ["F = ma", "PV = nRT", "E = mc²", "V = IR"], "B", 4, "PV = nRT relates pressure, volume, moles, and temperature of a gas.", "HS-PS1-8"),
        ("In which phase of mitosis do chromosomes line up at the center?", ["Prophase", "Metaphase", "Anaphase", "Telophase"], "B", 4, "During metaphase, chromosomes align at the cell's equator.", "HS-LS1-4"),
        ("What subatomic particle determines the element?", ["Neutron", "Electron", "Proton", "Photon"], "C", 2, "The number of protons determines the element (atomic number).", "HS-PS1-1"),
    ],
    ("9-12", "General Knowledge"): [
        ("What was the main cause of World War I?", ["The atomic bomb", "Assassination of Archduke Franz Ferdinand", "The fall of the Berlin Wall", "Discovery of America"], "B", 2, "The assassination of Archduke Franz Ferdinand triggered WWI.", "GK.912.1"),
        ("What is the theory of relativity associated with?", ["Newton", "Einstein", "Darwin", "Galileo"], "B", 2, "Albert Einstein developed the theory of relativity.", "GK.912.2"),
        ("What is 'supply and demand'?", ["A shipping term", "An economic principle where price is determined by availability and desire", "A political system", "A scientific law"], "B", 3, "Supply and demand: when demand exceeds supply, prices rise, and vice versa.", "GK.912.3"),
        ("What is the Universal Declaration of Human Rights?", ["A US constitutional amendment", "A UN document outlining fundamental human rights", "A European trade agreement", "A scientific publication"], "B", 3, "The UDHR (1948) outlines fundamental human rights for all people.", "GK.912.3"),
        ("What is 'cognitive bias'?", ["A type of intelligence", "A systematic error in thinking that affects decisions", "A learning disability", "A memory technique"], "B", 4, "Cognitive bias is a systematic pattern of deviation from rational judgment.", "GK.912.4"),
        ("What programming concept repeats a block of code?", ["Variable", "Function", "Loop", "Class"], "C", 3, "A loop repeats a block of code until a condition is met.", "GK.912.5"),
        ("What is 'sustainability'?", ["Making things last forever", "Meeting present needs without compromising future generations", "Recycling only", "Using less electricity"], "B", 3, "Sustainability means meeting current needs without harming future generations.", "GK.912.4"),
        ("What is the difference between 'weather' and 'climate'?", ["They are the same", "Weather is short-term; climate is long-term average", "Climate is short-term; weather is long-term", "Weather only applies to rain"], "B", 2, "Weather is day-to-day conditions; climate is the long-term average.", "GK.912.4"),
    ],
}


def seed():
    total = 0
    batch_count = 0
    batch = db.batch()

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

            # Firestore batch limit is 500
            if batch_count >= 450:
                print(f"  Committing batch ({batch_count} docs)...")
                batch.commit()
                batch = db.batch()
                batch_count = 0
                time.sleep(0.5)

    # Commit remaining
    if batch_count > 0:
        print(f"  Committing final batch ({batch_count} docs)...")
        batch.commit()

    print(f"\n✅ Seeded {total} questions across all grade bands and subjects.")

    # Print summary
    print("\n📊 Summary:")
    for (grade_band, subject), questions in QUESTIONS.items():
        print(f"   {grade_band:6s} | {subject:20s} | {len(questions)} questions")


if __name__ == "__main__":
    print("🎯 Seeding NWEA-style Question Bank...\n")
    seed()
