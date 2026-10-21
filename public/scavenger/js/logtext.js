// Note: deterministic text for in-world logs, notes and signs; every random choice comes from the rng the caller passes in.

import { Rand, seedFromString } from './rand.js';

const MAX_TEXT = 200;
const MAX_TITLE = 36;
const LETTERS = 'ABCDEF';

// Note: crew, kids and small fixed vocabularies; the station name picks a stable cast from these.
const FIRST = [
  'Marisol', 'Tobias', 'Anneke', 'Dmitri', 'Priya', 'Chidi', 'Hana', 'Bruno', 'Wren', 'Elias', 'Jun', 'Lucia',
  'Mateo', 'Ingrid', 'Sol', 'Kofi', 'Noor', 'Pavel', 'Ruth', 'Tamsin', 'Odile', 'Rafi', 'Yara', 'Gus',
  'Leilani', 'Anselm', 'Mei', 'Teodor', 'Saoirse', 'Isamu', 'Bea', 'Cormac',
];
const CALLS = [
  'Kestrel', 'Moth', 'Biscuit', 'Lantern', 'Pixel', 'Sparrow', 'Tinker', 'Nightjar', 'Comet', 'Marmot', 'Halo',
  'Static', 'Juniper', 'Spindle', 'Ratchet', 'Cricket',
];
const ROLES = [
  'hydroponics', 'dock chief', 'night operator', 'cook', 'teacher', 'engineer', 'medic', 'archivist', 'pilot',
  'astronomer', 'plumber', 'comms tech',
];
const KIDS = ['Pip', 'Nina', 'Ola', 'Max', 'Juno', 'Tess', 'Ravi', 'Mina', 'Otto', 'Zed', 'Lia', 'Benji', 'Cleo', 'Ari'];
const RECIPIENTS = ['Mum', 'Papa', 'Gran', 'Ines', 'Sis', 'Theo', 'Auntie Bo', 'Grandad'];
const CATS = ['Crumpet', 'Pepper', 'Mochi', 'Admiral', 'Sprocket', 'Noodle', 'Gizmo', 'Captain Whiskers', 'Pickle', 'Waffles'];
const LIGHTS_OUT = ['21:30', '22:00', '22:00', '22:30', '23:00'];
const NICKNAMES = [
  'Gerald', 'Big Marge', 'Little Hope', 'Mr. Fuzz', 'The Duchess', 'Ketchup', 'Sprout', 'Old Ed', 'Pip', 'Doris', 'Clementine',
  'Professor Stem', 'Bernard', 'Lady Moss', 'Otis', 'Wilhelmina', 'Captain Leaf', 'Mortimer', 'Rosa', 'Tiny',
];
const BANDS = [
  'The Paper Moons', 'Velvet Static', 'Hotel Vega', 'Night Shift', 'The Slow Hands', 'Cold Harbor', 'Satellite Sundays',
  'The Dial Tones', 'Mira and the Machines', 'Lunar Tides', 'Orbit Orchestra', 'The Late Arrivals', 'Glass Garden',
  'The Understudies',
];
const TRACK_A = [
  'Blue', 'Slow', 'Neon', 'Last', 'Paper', 'Static', 'Kitchen', 'Midnight', 'Glass', 'Velvet', 'Orbit', 'Soft',
  'Distant', 'Amber', 'Quiet', 'Winter', 'Spare', 'Faded', 'Electric', 'Borrowed',
];
const TRACK_B = [
  'Hour', 'Lullaby', 'Train', 'Summer', 'Light', 'Weather', 'Radio', 'Window', 'Harbor', 'Signal', 'Waltz', 'Rain',
  'Carousel', 'Tape', 'Postcard', 'Skyline', 'Telephone', 'Orchard', 'Lantern', 'Elevator',
];
const MOVIES = [
  'The Long Orbit', 'Night Train to Titan', 'Attack of the Giant Tomatoes', 'Moonlight Mechanics', 'The Last Lighthouse',
  'Hotel Zero-G', 'The Tin Moon', 'Rocket Boy and the Radio', 'Marmalade Skies', 'Dinner at Perihelion',
  'Little Robot, Big Rain', 'The Cassette Kid',
];
const SNACKS = [
  'toffees', 'dried apricots', 'salt crackers', 'powdered cocoa', 'peanut brittle', 'tinned peaches', 'toast', 'popcorn',
  'jam sandwiches', 'ginger biscuits',
];
const TECH = [
  'floppy disk', 'cassette', 'CRT', 'VHS tape', 'dot-matrix printer', 'pager', 'modem', 'pocket pet', 'Walkman',
  'Polaroid', 'fax machine', 'typewriter', 'teletext set', 'answering machine', 'slide projector',
];
const ITEMS = [
  'Walkman', 'mix tape', 'thermos', 'lucky wrench', 'pair of reading glasses', 'pager', 'paperback', 'Polaroid', 'deck of cards',
  'good scarf', 'slinky', 'calculator watch',
];
const ITEMS_FULL = [
  'a Walkman with a half-wound cassette', 'two floppy disks labeled TAXES and NOT TAXES', 'a pager that is still on',
  'a pocket pet, still beeping, named Pixel', 'a dog-eared paperback', 'a Polaroid of a sunlit kitchen',
  'wool socks, darned twice', 'a slinky', 'a thermos with an inch of cold tea', 'a postcard of a beach, unsent',
  'a VHS tape labeled HOME VIDEOS 1992', 'a pair of dice (loaded?)', 'a calculator watch', 'a travel chess set mid-game',
  'a mix tape, side B only', 'a tin of buttons', 'a spare key to nothing', 'a lucky wrench with a ribbon',
  'three photographs, one blurred', 'a hand-knitted hat', 'a box of birthday candles, half used',
  'a cassette labeled RAIN (SIDE A) and RAIN (SIDE B)', 'a pocket mirror and a very small comb', 'a folded paper crane, one wing mended',
  'a mug that says NOT TODAY, GRAVITY', 'a pocket radio tuned between stations', 'a stack of postcards, all of the same lake',
  'a pair of binoculars and a bird book', 'a jar of buttons, a jar of screws, a jar of tokens', 'a framed picture, face to the wall',
  'a handheld game with one working button', 'a stack of burned CDs labeled FOR THE LONG SHIFT', 'a cassette player with a rubber band for a belt',
  'a roll of film, never developed', 'a puzzle cube, solved on one side only', 'a keychain pet, battery flat, still named Biscuit',
  'a box of floppies, labels in three colors', 'a sheet of stickers, mostly used', 'a pen that writes in four colors, three of them dry',
  'a folded city map with one street circled', 'headphones with one foam ear missing', 'a stuffed rabbit with one button eye',
  'a lunchbox with a rocket on the lid', 'a diary with a tiny brass lock', 'a pair of roller skates, wheels freshly oiled',
  'a radio-controlled car with one wheel missing', 'a tape labeled DOG (BARKING), 40 MIN', 'a model rocket, glued twice',
  'a bundle of letters tied with a shoelace', 'a flask of cold cocoa', 'a poster tube, still sealed', 'a jar of marbles and one ball bearing',
];
const GOODS = [
  'seed trays', 'blank cassettes', '3.5 in floppies', 'fanfold paper', 'canned peaches',
  'spare CRT tubes', 'string lights', 'vinyl records', 'board games', 'wool blankets', 'popcorn kernels',
  'jukebox discs', 'paper-planet mobile kits', 'instant coffee', 'arcade tokens', 'tinned ham', 'garden gnomes',
];
const BOOKS = [
  'A Field Guide to Indoor Weather', 'Ten Thousand Recipes for Powdered Egg', 'Gardening Without Weather',
  'How to Whistle in Low Gravity', "The Radio Amateur's Handbook, Vol. 2", 'Tides, and Why We Miss Them',
  'Basic Programming for the Whole Family', 'Reading Star Charts in 30 Days', 'Letters Home: A Collection',
  'The Long Shift: Poems', 'Dial-Up: A Short History', 'Mending Things That Cannot Be Mended', 'Your First Orbit',
  'Knitting in Zero-G', 'Trees I Remember', 'Maps of Places That Moved', 'A Brief History of Weather',
  "The Lighthouse Keeper's Almanac", 'Sleeping Under Other Suns', 'The Quiet Hour: Essays',
  'How to Build a Radio from a Biscuit Tin', 'Letters to a Young Astronomer', 'The Complete Crossword Omnibus, Vol. 9',
  'Fifty Walks Around a Small Garden', 'Home Computing for Beginners', 'Tea, Toast and Other Comforts', 'Songs to Whistle at Night',
  'Atlas of Clouds', 'Practical Origami for Long Journeys', 'The Telephone Book of a Town That Is Gone', 'Waiting Rooms: A Photo Essay',
  'A Guide to Birds You Will Not See Again', 'Everyday Knots and What They Hold', 'How to Mend a Sweater', 'The Night Watch Cookbook',
  'Pocket Atlas of Lost Harbors', 'Whistling Kettles: Short Stories',
];

// Note: arcade games; names that match the showcase apps get a flavor line.
const GAMES = [
  'STAR HARBOR', 'NEON RUNNER', 'CAVE DIVER', 'ROCKET RALLY', 'ASTEROID ALLEY', 'GALAXY GARDENER', 'TOMATO DEFENDER',
  'VACUUM DASH', 'COMET CATCHER', 'DEEP DOCK', 'SLIME STATION', 'LASER LIBRARY', 'PADDLE PLANET', 'ZERO-G BOWLING',
];
const GAME_HINT = {
  AETHER: 'light drifting in the dark',
  AMBIENCE: 'sit down, close your eyes',
  CYBERFLIGHT: 'neon canyon, one ship',
  ENDURANCE: 'how long can you last',
  GLIDER: 'one paper plane, endless wind',
  ORBIT: 'slingshot the little moon',
  PINBALL: 'silver ball, three flippers',
  RADIO: 'turn the dial, find the voice',
  SCAVENGER: 'fly the dark tunnels',
  SIMZONE: 'a tiny city on a screen',
  SPHERICAL: 'roll the whole world',
  SYNTHSTREAM: 'notes fall, you catch them',
  'TEXT MINER': 'dig the words, find the vein',
  TRANSLATOR: 'decode the old message',
};
const ATTRACT = ['INSERT COIN', 'PRESS START', 'PLAYER 1 READY', 'CREDITS 00', 'FREE PLAY', 'CONTINUE? 9 8 7 6 5'];

// Note: one entry per theme; every list holds full phrases so kinds can splice them into frames.
const THEME = {
  junction: {
    label: 'JUNCTION',
    where: ['the junction', 'the crossway'],
    things: ['the arrow signs', 'the lift call panel', 'the hand-painted deck map', 'the bench under the map'],
    sounds: ['trolley wheels from a long way off', 'air shifting between four ducts', 'the arrow lamps ticking'],
    gripes: [
      'Whoever keeps turning the arrow signs around: it is not funny.',
      'The deck map is wrong. Left is right on deck 7.',
      'Three tunnels meet here and nobody agrees which one is north.',
    ],
    rules: ['Keep the crossway clear.', 'Give way to trolleys.', 'No loitering under the signs.'],
    nice: [
      'Someone chalked a small sun beside the left arrow.',
      'A flask sits on the bench with a note: for anyone.',
      'Under YOU ARE HERE someone wrote, in pencil: yes. still.',
    ],
    odd: [
      'The bench is still warm.',
      'A trolley waits here, brake on, lamp lit.',
      'Every arrow sign points the same way now.',
      'The lamp above the map blinks the same pattern every nine seconds.',
    ],
    plaque: ['JUNCTION. Many ways in. Please find one out.', 'All paths lead somewhere. Some of them lead home.'],
  },
  valves: {
    label: 'VALVE GALLERY',
    where: ['the valve gallery', 'the pipe gallery'],
    things: ['the big red handwheel', 'the gauge wall', 'the main manifold', 'the steam trap'],
    sounds: ['a slow hiss from behind the wall', 'pipes ticking as they cool', 'water finding its way downhill'],
    gripes: [
      'Wheel 9 turns the wrong way. It always has.',
      'The gauge on line 4 says 4. It has said 4 for a year.',
      'Stop hanging coats on the manifold.',
    ],
    rules: ['Do not turn a red wheel without a tag.', 'Ear defenders past the yellow line.', 'Log every wheel you touch.'],
    nice: [
      'The glass on the line 2 gauge is polished like a coin.',
      'Someone taped a paper duck to the big wheel for luck.',
      'There is a kettle on the warmest pipe.',
    ],
    odd: [
      'A wheel that was shut last week is open.',
      'Every gauge needle leans the same way.',
      'All the valve tags are signed with the same initials.',
    ],
    plaque: ['Everything that flows here, flows because someone cared.', 'VALVE GALLERY. Turn gently.'],
  },
  hangar: {
    label: 'HANGAR',
    where: ['the hangar', 'the dock hall'],
    things: ['the cradle lights', 'the tow tractor', 'the painted landing grid', 'the crew shuttle'],
    sounds: ['the cradle lights buzzing', 'a loose panel ticking in the draft', 'your own footsteps coming back late'],
    gripes: [
      'Who left the tug in the middle of the grid again?',
      'The paint is peeling at bay 3. Fix it before the next arrival.',
      'There is a moth in the hangar. Nobody will say how it got here.',
    ],
    rules: ['Chocks in. Always.', 'No flames. Not even the birthday candle.', 'Walk the painted lines only.'],
    nice: [
      'Someone chalked WELCOME HOME beside bay 1.',
      'The landing lights are on, as they are every night.',
      'A lantern sits in the cradle window for late arrivals.',
    ],
    odd: [
      'Bay 1 is marked OCCUPIED. Bay 1 is empty.',
      'The arrivals board has one line: 1 EXPECTED, ETA NOW.',
      'The landing lights switch on whenever somebody enters.',
    ],
    plaque: ['DOCKING BAY ONE. All arrivals welcome.', 'The light stays on for late arrivals.'],
  },
  lounge: {
    label: 'LOUNGE',
    where: ['the lounge', 'the rec room'],
    things: ['the jukebox', 'the popcorn machine', 'the green beanbag', 'the VHS shelf'],
    sounds: ['the jukebox humming to itself', 'ice settling in a glass nobody drank from', 'hiss from the VHS deck'],
    gripes: [
      'Please stop feeding the jukebox. It has opinions.',
      'Rewind your tapes. Be kind.',
      'Whoever took the green beanbag: it was not yours.',
    ],
    rules: ['Rewind your tapes.', 'Three songs each, no repeats.', 'Cups go in the rack, not the vents.'],
    nice: [
      'Movie night is every Friday. Bring a blanket.',
      'The good armchair is for whoever had the worst week.',
      'Somebody always leaves the first seat free.',
    ],
    odd: [
      'The jukebox plays one song. Always the same song.',
      'Two glasses on the table, one half full, neither sweating.',
      'The VHS deck is on pause. The picture is a frozen kitchen.',
    ],
    plaque: ['LOUNGE. Because nobody gets through a long shift alone.', 'Sit. Stay. Someone will bring tea.'],
  },
  greenhouse: {
    label: 'GREENHOUSE',
    where: ['the greenhouse', 'the grow hall'],
    things: ['the tomato rows', 'the misting rig', 'the old watering can', 'the grow lamps'],
    sounds: ['mist hissing over leaves', 'water ticking on tin', 'a pump breathing in the walls'],
    gripes: [
      'Do NOT pick the green ones.',
      'Who unplugged lamp bank C? The basil is sulking.',
      'Stop naming the tomatoes. Gerald is quite enough.',
    ],
    rules: ['Wash your hands. Then wash them again.', 'Close the door. Moths are not crew.', 'Water before 08:00 or after 20:00.'],
    nice: [
      'The strawberries came in early. Share them.',
      'There is a chair in the middle of the rows, for reading.',
      'Someone hung a wind chime. There is no wind.',
    ],
    odd: [
      'The soil is damp. The schedule says it was last watered long ago.',
      'Every leaf faces the doorway.',
      'The low branches have been picked clean. Only the low ones.',
    ],
    plaque: ['In honor of the first seed.', 'Everything here grew because someone stayed.'],
  },
  nursery: {
    label: 'NURSERY',
    where: ['the nursery', 'the play room'],
    things: ['the block shelf', 'the tiny chairs', 'the paper-planet mobile', 'the cubby hooks'],
    sounds: ['a music box winding down', 'the mobile turning in no wind', 'a plastic wheel clicking'],
    gripes: [
      'Whose sock is this? It has a hole and a name tag: not mine.',
      'Please sort the blocks: red with red, blue with blue, wheels with wheels.',
      'Nap time is nap time. The vent is not a slide.',
    ],
    rules: ['Tiny feet first.', 'Shoes off, stories on.', 'Three stories, then lights out.'],
    nice: [
      'Forty paper stars on the wall, one for every night without a bad dream.',
      'Every cubby hook has a name in crayon.',
      'A little blanket is folded on every cot.',
    ],
    odd: [
      'The mobile turns slowly. The air is still.',
      'The moon-shaped nightlight comes on when someone enters.',
      'Every cot is made. One pillow has a dent in it.',
    ],
    plaque: ['For the small ones. May they grow slower than the station.', 'NURSERY. Walk quietly. Dreams in progress.'],
  },
  archive: {
    label: 'ARCHIVE',
    where: ['the archive', 'the stacks'],
    things: ['the card catalog', 'the microfiche reader', 'the dot-matrix printer', 'the green reading lamps'],
    sounds: ['paper settling', 'a reader fan ticking', 'the printer clearing its throat'],
    gripes: [
      'Return what you borrow. Yes, you.',
      'The microfiche reader overheats. Be gentle, and quick.',
      'Someone is shelving by color. Stop it.',
    ],
    rules: ['Silence in the stacks.', 'Pencils only.', 'Leave it as you found it, or better.'],
    nice: [
      'There is a tin of boiled sweets on the desk for the archivist.',
      'The green lamps are warm. Sit a while.',
      'A bookmark holds the page where someone stopped reading.',
    ],
    odd: [
      'A book lies open on the desk, face down. No dust on it.',
      'The catalog drawer for the last year is missing.',
      'The printer tray holds one page. It is still warm.',
    ],
    plaque: ['What is kept is not lost.', 'ARCHIVE. Please return what you borrow.'],
  },
  arcade: {
    label: 'ARCADE',
    where: ['the arcade', 'the games room'],
    things: ['the cabinets', 'the change machine', 'the claw machine', 'the high-score board'],
    sounds: ['attract-mode jingles in every key', 'a coin rattling in a drain', 'speakers popping on and off'],
    gripes: [
      'The claw machine is rigged. I demand a recount.',
      'Whoever hit TILT on the pinball: confess.',
      'Fifteen tokens in, one prize out. Explain that.',
    ],
    rules: ['No leaning on the cabinets.', 'Winner stays on.', 'Tokens are not money, they are a promise.'],
    nice: [
      'Tokens are free on Fridays.',
      'The best seat is the one with the broken stool.',
      'Someone leaves a single token on every cabinet.',
    ],
    odd: [
      'Every cabinet is in attract mode, all showing the same demo.',
      'A fresh high score sits on the board. Nobody has been here for ages.',
      'The change machine just dropped a token into the tray.',
    ],
    plaque: ['ARCADE. Insert coin. Insert friend.', 'Here, losing was always a good time.'],
  },
  reactor: {
    label: 'REACTOR HALL',
    where: ['the reactor hall', 'the core gallery'],
    things: ['the core housing', 'the coolant manifold', 'the safety counter', 'the catwalk rail'],
    sounds: ['a deep note you feel in your teeth', 'a steady blue hum', 'coolant moving behind the shielding'],
    gripes: [
      'The hum is flat again. Can someone retune it? Anyone?',
      'Do not tape notes to the shielding.',
      'Who propped the door with a boot?',
    ],
    rules: ['Dosimeter on. Always on.', 'Two people at the rail.', 'Do not whistle near the core. Yes, it is a superstition.'],
    nice: [
      'A mug with a smiley face sits on the rail.',
      'Someone taped a star chart to the shielding. For luck.',
      'The night shift keeps a plant by the door. It leans toward the core.',
    ],
    odd: [
      'The safety counter reads 0 DAYS. Under it, hand-painted: 412.',
      'The core hums in a key you almost recognize.',
      'Every warning light is green. Nobody switched them to green.',
    ],
    plaque: ['To the night shift: you kept it warm.', 'REACTOR HALL. Quiet hands, steady hearts.'],
  },
  atrium: {
    label: 'ATRIUM',
    where: ['the atrium', 'the big hall'],
    things: ['the fountain', 'the balcony rails', 'the skylight', 'the long staircase'],
    sounds: ['water falling a long way', 'your voice returning a second late', 'the rails creaking as they warm'],
    gripes: [
      'Do not throw coins in the fountain. The pump eats them.',
      'The echo is not a toy.',
      'Who hung laundry from the balcony?',
    ],
    rules: ['Walk, do not glide, on the stairs.', 'Quiet voices after {lo}.', 'Keep the fountain full.'],
    nice: [
      'A thousand wishes sit at the bottom of the fountain, all pennies.',
      'Morning light crosses the floor at 07:10. Be here for it.',
      'The balcony has the best view on the ring.',
    ],
    odd: [
      'The fountain is running. The pump was removed last year.',
      'Footsteps on the upper balcony stop when you stop.',
      'Something crosses the skylight every nine minutes, too slow to be a star.',
    ],
    plaque: ['ATRIUM. A little sky, for those who live inside.', 'Look up.'],
  },
  cargo: {
    label: 'CARGO BAY',
    where: ['the cargo bay', 'the stores'],
    things: ['the pallet racks', 'the old forklift', 'the crate stacks', 'the cage lift'],
    sounds: ['strapping creaking under load', 'a distant forklift beeping', 'metal contracting in the cold'],
    gripes: [
      'Label your crates. "Misc" is not a label.',
      'The cage lift sticks on deck 3. Kick it, not me.',
      'Someone is stacking five high. Four is the limit.',
    ],
    rules: ['Four high. Never five.', 'Hard hats past the yellow line.', 'Tag it, log it, then lift it.'],
    nice: [
      'There is a crate marked FRAGILE: BOARD GAMES.',
      'A radio plays low in the foreman cage.',
      'Someone stacked spare coats by the heater.',
    ],
    odd: [
      'One crate waits alone in the aisle, addressed to nobody on any list.',
      'The forklift is parked neatly. Keys in. Lamp on.',
      'Every crate label has been turned to face the door.',
    ],
    plaque: ['CARGO BAY. Everything that arrives was wanted.', 'Lift with your knees. Live with your heart.'],
  },
  dorm: {
    label: 'DORM',
    where: ['the dorm', 'the sleeping deck'],
    things: ['the bunks', 'the lockers', 'the reading lights', 'the shared radio'],
    sounds: ['breathing that is probably the vents', 'the shared radio between stations', 'a bunk ladder ticking as it cools'],
    gripes: [
      'Whoever snores: we are begging you.',
      'The top bunk lamp is too bright for the bottom bunk. Share.',
      'Lights out means lights out. Yes, you, with the flashlight.',
    ],
    rules: ['Lights out at {lo}.', 'Boots at the door.', 'Headphones low after midnight.'],
    nice: [
      'A hand-drawn calendar counts the days until the supply run.',
      'Someone left a lamp on in bunk 4, for the walk home.',
      'Every pillow has a name sewn on.',
    ],
    odd: [
      'One bunk has its blanket pulled back, as if someone just got up.',
      'The reading light above bunk 6 clicks on at 03:00.',
      'The radio is tuned between stations, and a voice is nearly there.',
    ],
    plaque: ['Sleep well. The lights are on for you.', 'DORM. Rest is also work.'],
  },
  promenade: {
    label: 'PROMENADE',
    where: ['the promenade', 'the concourse'],
    things: ['the shop fronts', 'the neon signs', 'the long benches', 'the big clock'],
    sounds: ['neon buzzing in three keys', 'a shutter rattling in the draft', 'the clock ticking out of step'],
    gripes: [
      'The noodle bar sign has flickered forever. Fix it or feed us.',
      'Please stop racing carts down the promenade.',
      'The clock is eleven minutes slow. It always was.',
    ],
    rules: ['Walk on the right.', 'Busking on weekends only.', 'Take only photographs. And sticky tape.'],
    nice: [
      'The noodle bar leaves its sign on for anyone hungry.',
      'A busker left a hat of buttons by the fountain.',
      'The cinema marquee still says: TONIGHT: LAST SHOW.',
    ],
    odd: [
      'Every shop sign is lit. Every shutter is down.',
      'The big clock stopped at the hour the lights went to night mode.',
      'The OPEN sign in the noodle bar switches itself on at noon.',
    ],
    plaque: ['PROMENADE. Take the long way.', 'Nobody ever walked here alone.'],
  },
  control: {
    label: 'CONTROL',
    where: ['the control room', 'the ops room'],
    things: ['the big board', 'the night chair', 'the status wall', 'the radio rack'],
    sounds: ['relays ticking like rain', 'the status wall breathing green', 'a headset hissing on the desk'],
    gripes: [
      'Do not eat at the console. The crumbs are in the rack again.',
      'Who set the alarm tone to a waltz?',
      'Someone adjusted the night chair. Put it back.',
    ],
    rules: ['Log every call.', 'Two on watch, always.', 'The red phone is for emergencies. The beige phone is for pizza.'],
    nice: [
      'A kettle lives under the status wall. Treat it kindly.',
      'The night operator keeps toffees by the board.',
      'Postcards from home are pinned around every screen.',
    ],
    odd: [
      'Every console reads READY. Nobody is ready.',
      'The log has a handwritten line at the bottom: STILL HERE.',
      'The watch chair is warm.',
    ],
    plaque: ['CONTROL. Someone is always watching, so everyone else can sleep.', 'Stand watch. Stay kind.'],
  },
  observatory: {
    label: 'OBSERVATORY',
    where: ['the observatory', 'the dome'],
    things: ['the big telescope', 'the star charts', 'the viewing slit', 'the filter wheel'],
    sounds: ['the dome motor ticking as it cools', 'a chart recorder scratching a line', 'frost cracking on the glass'],
    gripes: [
      'Do not touch the mirror. Not with a finger, not with a sleeve.',
      'Who left the dome open overnight?',
      'Red light only after dusk, please.',
    ],
    rules: ['Red flashlights only.', 'Sign the logbook.', 'Mind your head on the eyepiece.'],
    nice: [
      'A blanket and a flask live under the telescope for the late watch.',
      'The star charts are marked in four colors of pen.',
      'Someone taped a Polaroid of the planet to the tube.',
    ],
    odd: [
      'The telescope points at one place in the sky. It has not moved.',
      'The logbook has one entry per night: NOTHING NEW. In different hands.',
      'A fresh pencil mark on the chart shows a star that was not there last week.',
    ],
    plaque: ['For those who looked up.', 'OBSERVATORY. The sky does not look back. Look anyway.'],
  },
  chapel: {
    label: 'CHAPEL',
    where: ['the chapel', 'the quiet room'],
    things: ['the electric candles', 'the long bench', 'the little bell', 'the prayer slips'],
    sounds: ['a single pipe note held very low', 'candles ticking on their timers', 'the vent sighing'],
    gripes: [
      'Please push the bench back afterwards.',
      'The bell is for ringing softly.',
      'Whoever keeps taking all the slips: leave some for the rest of us.',
    ],
    rules: ['Quiet.', 'Shoes may be worn. Worries may not.', 'Leave a slip, take a slip.'],
    nice: [
      'Take a slip of paper and write what you cannot say aloud.',
      'The candles are electric. The warmth is not.',
      'A blanket is folded on every bench.',
    ],
    odd: [
      'Every candle is lit. Their timers read 0:00.',
      'A slip of paper lies on the bench, still warm.',
      'The little bell is swinging. The room is still.',
    ],
    plaque: ['A quiet place. Please keep it so.', 'Whoever you are, you are welcome.'],
  },
  substation: {
    label: 'SUBSTATION',
    where: ['the substation', 'the transformer hall'],
    things: ['the busbar gantry', 'the oil gauge on T-1', 'the switchgear row', 'the earthing rail'],
    sounds: ['a hundred-cycle hum in the floor', 'oil ticking in the cooling fins', 'a far crackle from the busbars'],
    gripes: [
      'The hum is louder on the north row. Nobody will say why.',
      'Please stop hanging coats on the earthing rail.',
      'Bay 6 has been "temporarily" bypassed since the second year.',
    ],
    rules: ['Never touch a bar you have not tested.', 'Two keys for every cabinet.', 'Rubber mat. Rubber gloves. Rubber nerves.'],
    nice: [
      'Someone painted a small sun on the side of T-3.',
      'The night crew leave a thermos on the warm transformer. Help yourself.',
      'The gauge glass on T-2 is polished like a coin.',
    ],
    odd: [
      'Every gauge needle points at 50. The hum does not.',
      'The lockout tags all carry the same name. It is not a name on any roster.',
      'A transformer you were sure was cold is warm to the hand.',
      'Nothing is drawing power. Everything is humming.',
    ],
    plaque: ['SUBSTATION. All the light in the dark begins here.', 'Handle with care what everyone else takes for granted.'],
  },
  pumphouse: {
    label: 'PUMPHOUSE',
    where: ['the pumphouse', 'the pump hall'],
    things: ['the duty pump', 'the surge tank', 'the gauge board', 'the big red handwheel'],
    sounds: ['water finding its way downhill', 'a slow stroke behind the wall', 'a drip that keeps its own time'],
    gripes: [
      'Pump 3 shakes the coffee off the desk. Pump 3 knows what it did.',
      'The gauge on tank B has read 40 percent for a year.',
      'Whoever keeps leaving the drain open: it is not a sink.',
    ],
    rules: ['Never run a pump dry.', 'Log every stroke count.', 'Boots on the grating, always.'],
    nice: [
      'A paper boat sits on the surge tank, dry and undisturbed.',
      'The duty pump has a name on a strip of tape: Gladys.',
      'Someone keeps a fern by the drain. It is thriving.',
    ],
    odd: [
      'The tanks read full. They have read full for a very long time.',
      'The duty pump is running. Its intake is shut.',
      'Water on the floor, and no pipe above it.',
    ],
    plaque: ['PUMPHOUSE. What flows here keeps the rest alive.', 'Slow water, steady hands.'],
  },
  relay: {
    label: 'SIGNAL RELAY',
    where: ['the relay room', 'the signal hall'],
    things: ['the antenna mast', 'the patch rack', 'the log desk', 'the dish feed'],
    sounds: ['static with a voice inside it', 'relays clicking in no hurry', 'a carrier tone held very long'],
    gripes: [
      'Do not tune the long-wave rack. It was tuned. It was tuned for a reason.',
      'The kettle is for the operators, not the transmitter.',
      'Someone keeps rewinding the tape in channel 4.',
    ],
    rules: ['Log every carrier.', 'Never transmit on 7 without a countersign.', 'Listen first. Then speak.'],
    nice: [
      'A card from a ship taped to the mast: thanks for staying on the line.',
      'The operator on nights hums along with the carrier. It is in tune.',
      'The coffee cup says WORLD\'S OKAYEST OPERATOR.',
    ],
    odd: [
      'Channel 4 is answering a call nobody made.',
      'The log\'s last entry is a time that has not happened yet.',
      'Every dial is set to the same frequency. The hiss on it sounds like breathing.',
    ],
    plaque: ['RELAY. We keep the line open.', 'Somewhere, someone is still listening.'],
  },
  lock: {
    label: 'PRESSURE LOCK',
    where: ['the pressure lock', 'the lock chamber'],
    things: ['the inner door', 'the cycle panel', 'the gauge pair', 'the suit rack'],
    sounds: ['a long hiss that never finishes', 'a heavy bolt settling', 'air pressing on the doors from both sides'],
    gripes: [
      'The cycle light sticks on amber. Tap it twice.',
      'Who left a glove in the chamber again?',
      'Nobody has used the outer door since the inspection. Nobody will say why.',
    ],
    rules: ['Never open both doors.', 'Check the gauge pair. Both of them.', 'Suits on before the cycle, not during.'],
    nice: [
      'Someone scratched a small flower beside the inner handle.',
      'The suit rack holds a child-sized helmet, polished.',
      'A thermos stands inside the door: for whoever comes in cold.',
    ],
    odd: [
      'Both gauges read zero. Both doors are shut. The cycle light is green.',
      'The outer door has a handprint on the inside.',
      'The chamber is cycling. Nobody is in it.',
    ],
    plaque: ['LOCK. Between here and out there, one careful door.', 'Pressure equalised. Take your time.'],
  },
};

// Note: district flavor: adjectives, odd details, an outside view, goods, sensors and console events.
const DIST = {
  engineering: {
    label: 'ENGINEERING',
    adj: ['oily', 'warm', 'humming', 'cluttered'],
    odd: [
      'The pipe tags have all faded to the same gray.',
      'A wrench lies on the floor, still warm from a hand.',
      'The coolant is cold and still, yet the gauges flicker as if it flowed.',
    ],
    view: 'Radiator fins glow a dull cherry along the hull.',
    goods: ['gaskets (assorted)', 'coolant (20 L)', 'thermal paste', 'weld rod', 'pump seals', 'fuse strips'],
    sensors: [
      ['COOLANT', 4.2, 'BAR', 0.3, 1], ['BUS A', 398, 'V', 4, 0], ['TURBINE', 3000, 'RPM', 40, 0], ['HULL', 3.1, 'K', 0.4, 1],
      ['PUMP 2', 1180, 'RPM', 25, 0], ['VALVE 7', 62, 'PCT', 8, 0], ['BUS B', 401, 'V', 5, 0], ['SEAL', 0.8, 'BAR', 0.2, 1],
    ],
    events: [
      'coolant loop {n} pressure nominal, flow 0',
      'valve {nn} cycled. operator: none',
      'pump {n} restarted itself. again',
      'bus b draw 0.0 kw. lights: on',
      'hull ping {n} ok. repeated {nn} times',
      'turbine {n} spun down. spun up. spun down',
      'fuel cell stack {n} at {nn} percent. rising',
      'weld seam {nnn} inspected: fine. no inspector on file',
    ],
  },
  habitat: {
    label: 'HABITAT',
    adj: ['homely', 'quiet', 'faded', 'tidy'],
    odd: [
      'Slippers wait by the door, placed in pairs.',
      'The air smells faintly of toast.',
      'A radio plays low: a station that stopped broadcasting.',
    ],
    view: 'Window after window of the ring, lit amber, curves away.',
    goods: ['wool blankets', 'board games', 'loose-leaf tea', 'nightlights', 'picture frames', 'spare slippers'],
    sensors: [
      ['LIGHTS', 100, 'PCT', 0, 0], ['GALLEY', 21, 'C', 1.5, 1], ['WATER', 7.1, 'PH', 0.2, 1], ['AIR', 79, 'PCT N2', 1, 0],
      ['LAUNDRY', 38, 'C', 4, 0], ['SHOWER', 41, 'C', 2, 0], ['KETTLE', 94, 'C', 3, 0], ['CORRIDOR', 20.2, 'C', 0.8, 1],
    ],
    events: [
      'galley oven {n} warm. not scheduled',
      'air recycler {n}: filter light green',
      'laundry cycle complete. nobody collected',
      'lights-out {lo} executed on schedule',
      'shower {n} ran 4 min. not booked',
      'door {door} open. beds made',
      'thermostat {n}: 21 c. someone set it to 21 c',
      'galley terminal: {crew} ordered tea. cup dispensed',
    ],
  },
  research: {
    label: 'RESEARCH',
    adj: ['sterile', 'humming', 'chilly', 'labeled'],
    odd: [
      'The whiteboards are full. The last line is a question.',
      'Every instrument is logging. Nothing is being asked.',
      'The sample fridge hums in B-flat.',
    ],
    view: 'A survey probe winks its strobe, patient as a heartbeat.',
    goods: ['sample vials', 'cassette labels', 'filter paper', 'dry ice', 'lens tissue', 'graph paper'],
    sensors: [
      ['FREEZER', -80, 'C', 0.8, 1], ['LAB AIR', 99.9, 'PCT', 0.05, 2], ['DISH', 142, 'AZ', 3, 0], ['SPEC', 0.4, 'S', 0.1, 1],
      ['SCOPE', 4.2, 'K', 0.3, 1], ['GAIN', 61, 'DB', 3, 0], ['FLOOR', -118, 'DBM', 2, 0], ['SAMPLES', 12, 'PCT', 3, 0],
    ],
    events: [
      'freezer {n} holding -80 c. label: do not open',
      'spectrometer: same peak, every night, 02:14',
      'calibration offset drifted +0.4 s',
      'dish {n} slewed to az {nnn} el {nn}. no tasking',
      'sample tray {nn} relabeled in unknown hand',
      'centrifuge {n} spun to 3000 rpm. empty',
      'signal log: it is back. same as day {day}',
      'lab door {door} badge read: {crew}. {crew} is listed as away',
    ],
  },
  cargo: {
    label: 'LOGISTICS',
    adj: ['dusty', 'stacked', 'echoing', 'labeled'],
    odd: [
      'Labels face the aisle, every one, as if to be read.',
      'A radio plays low from a cage nobody is in.',
      'A pallet jack waits with a coat on its handle.',
    ],
    view: 'A cargo tug drifts dark beyond the dock lights.',
    goods: ['pallet wrap', 'strapping', 'shrink film', 'crate tags', 'hard hats', 'sticks of chalk'],
    sensors: [
      ['DOCK', 18, 'C', 2, 0], ['LOAD', 62, 'PCT', 12, 0], ['CRANE', 0, 'KN', 0, 1], ['RACK', 14, 'PCT', 4, 0],
      ['CAGE LIFT', 3.1, 'M', 0.4, 1], ['PALLETS', 214, 'EA', 4, 0], ['DOCK 2', 17, 'C', 2, 0], ['AIRLOCK', 100.9, 'KPA', 0.4, 1],
    ],
    events: [
      'dock crane parked. brake on. lamp on',
      'manifest {nnn} closed. contents undeclared',
      'pallet rack {n}: one slot empty. it was full',
      'arrivals board: 1 expected. eta: now',
      'cage lift {n} returned empty. went up. came down',
      'barcode {nnn}: unreadable. scanned anyway',
      'crane {n} lifted nothing for {nn} min',
    ],
  },
  command: {
    label: 'OPERATIONS',
    adj: ['glowing', 'attentive', 'hushed', 'blue-lit'],
    odd: [
      'Every screen reads READY.',
      'The night chair is turned toward the door.',
      'The call board shows one missed call. From here.',
    ],
    view: 'The navigation beacon on the far spar blinks its slow signature.',
    goods: ['spare CRT tubes', 'headsets', 'logbooks', 'star charts', 'tape drives', 'relay modules'],
    sensors: [
      ['LINK', 12, 'MS', 3, 0], ['CLOCK', 0.4, 'S', 0.1, 1], ['NAV', 0.003, 'DEG', 0.001, 3], ['WATCH', 0, 'OF 4', 0, 0],
      ['UPLINK', 1.2, 'KBPS', 0.3, 1], ['BEACON', 3, 'S', 0.5, 1], ['RELAY', 88, 'PCT', 5, 0], ['ANT', 211, 'AZ', 5, 0],
    ],
    events: [
      'watch roster: all posts show away',
      'comms: carrier on ch {n}, no traffic',
      'nav: attitude held. nobody asked',
      'log closed by: (blank)',
      'beacon test ok. replies: 1',
      'call board: 1 missed call. from this terminal',
      'shift change at {time}. nobody arrived. nobody left',
    ],
  },
  decay: {
    label: 'DORMANT',
    adj: ['cold', 'damp', 'dim', 'sealed'],
    odd: [
      'Dust lies thick on everything except the handrails.',
      'Cold air pools at ankle height and smells of coins.',
      'Mold has drawn a slow map across the ceiling tiles.',
      'The lamps are on. Their light looks tired.',
    ],
    view: 'A long stretch of the ring lies dark, every window black but one.',
    goods: ['tarps', 'dehumidifier packs', 'spare filters', 'sealant', 'rubber boots', 'candles (just in case)'],
    sensors: [
      ['DAMP', 78, 'PCT', 6, 0], ['TEMP', 9.5, 'C', 1.5, 1], ['MOSS', 12, 'PCT', 4, 0], ['DUST', 3.4, 'MG', 0.6, 1],
      ['SEEP', 4.2, 'ML/H', 1.2, 1], ['ROT', 7, 'PCT', 3, 0], ['GRATING', 1.9, 'MM', 0.4, 1], ['SPORES', 440, 'PPM', 90, 0],
    ],
    events: [
      'power rationed: lights and one lift only',
      'seal {door} holding. damp patch on deck',
      'sector {sector} flagged dormant. lights kept on',
      'moisture high. moss: probably',
      'fault {nnn}: unknown. ignoring',
      'heater {n} off. warm anyway',
      'maintenance round skipped. someone did it anyway',
    ],
  },
};

// Note: console events that fit any district.
const EVENTS_ANY = [
  'relay chatter on ch {n}, no source',
  'lift {n} held at deck {deck}. nobody called it',
  'door {door} closed and reopened itself',
  'lighting: on per schedule. schedule: unknown',
  'clock drift +{nn} min. nobody resets it',
  'dial tone detected on line {n}. no handset',
  'badge swipe at door {door}: {crew}. {crew} is listed as away',
  'coffee machine {n} brewed one cup. no cup in tray',
  'printer {n} produced one page. blank. warm',
  'intercom keyed on deck {deck}. 4 seconds of room tone',
  'fire door {door} test passed. tester: (blank)',
  'air handler {n} filter ok. last changed day {day}',
  'vending unit {n} sold one {snack}. last sale day {day}',
  'modem handshake heard on line {n}. no reply',
  'pager {nnn} received: WHERE ARE YOU. sender blank',
  'schedule note: movie night is on. it is always on',
  'ticket {nnn} closed by: self',
  'low priority: smell of toast reported. sector {sector}',
  'fax received: 1 page, blank. sender: this machine',
  'tape deck {n}: auto-reverse engaged. nothing playing',
  'vhs deck {n} on pause. frame: a kitchen, morning',
  'crt {n} degauss cycle. nobody asked',
  'floppy drive {n} spun up. disk: none',
  'answering machine {n}: 1 new message (0:04). played',
  'teletext page {nnn} updated. headline: INDOOR WEATHER FINE',
  'lamp check complete: all lit. nobody checked',
  'movie night reminder sent. 0 declined',
  'wake-up call {time}: answered. voice: none',
];
const AUTO_EVENTS = [
  ['LIGHTS-ON', '06:00'], ['LIGHTS-OUT', ''], ['SHIFT BELL', '14:00'], ['WATER CYCLE', '03:30'], ['AIR TEST', '12:00'],
  ['DOOR SWEEP', '04:00'], ['MOVIE NIGHT REMINDER', '19:00'], ['WATCH CHANGE', '18:00'], ['LAMP CHECK', '05:30'],
  ['MORNING CHIME', '07:00'],
];

const MEMOS = [
  'Fixed {thing}. Mostly. Please be gentle.',
  'Leaving this for the next shift: nothing happened. Nothing at all. Sleep well.',
  'I swapped the labels on shelf {n}. You will thank me by Friday, or hate me.',
  'Back at {time}. Save me some {snack}.',
  'The {tech} in {where} works if you hit it and say please. In that order.',
  '{gripe}',
  'Went to look at {thing}. Left my {item} on the desk. Back soon.',
  'Next supply run: day {quiet}. Cancel my {snack} order.',
  'Anyone who finds this: the {tech} password is the name of the first dog on the station. Good luck.',
  'We are fine. Everyone is fine. I am writing this so it is written down.',
  'Do not trust the clock in {where}. Trust the one in the galley.',
  'Lights-out is {lo} and it is a good rule. Keep it.',
  'Whoever keeps leaving the {tech} on: thank you. It is company.',
  'Reminder: {rule}',
  'Meeting moved to {time} in {where}. Bring a mug and a better excuse.',
  'The {tech} ate my {item} again. Complaint filed with {crew2}.',
  'Inventory check: {snack}, running low. Count them yourself. I trust nobody.',
  'Day {day} was a good day. I just wanted that on record.',
  'Overnight: all quiet. Again. Is that good? Asking for a friend.',
  'Please stop naming the {tech}. We have enough named things.',
  'Handover: nothing to report. The lights hum. The {tech} hums back.',
  'Message for whoever relieves me: the kettle is on, the chair is warm, the log is up to date.',
  'Tell {crew2} the {tech} is fixed. Do not tell {crew2} how.',
];

const LOGINS = [
  'WELCOME BACK, {crew^}. LAST LOGIN: DAY {day}.\n{n} MESSAGES WAITING.\nFIRST: "ARE YOU STILL THERE?"',
  'USER {call^} LOGGED IN {nn} MIN AGO. NO SESSION FOUND.',
  'SYSTEM CLOCK: DAY {after}. LAST CREW CHECK-IN: DAY {quiet}. INTERVAL: 1 DAY. OVERDUE.',
  'PASSWORD HINT: THE NAME OF THE FIRST DOG ON THE STATION.',
  'MAIL: {n} NEW. FROM: {crew^}. SUBJECT: LIGHTS. BODY: (EMPTY)',
  'ACCESS GRANTED: VISITOR. WELCOME. PLEASE SIGN THE LOG.',
  'GUEST SESSION OPENED. NO PASSWORD NEEDED. SOMEONE TURNED IT OFF ON DAY {quiet}.',
  'SCREEN SAVER: STARFIELD. PRESS ANY KEY.\n(SOMEONE PRESSED A KEY AT {late}.)',
  'LOGIN: {tag}\nPASSWORD: ********\nWELCOME BACK. WE MISSED YOU.',
  '{st} OPS TERMINAL {n}\nUSERS ONLINE: 1\nUSERS REGISTERED: 0',
  'NEW MESSAGE FROM {crew^}, DAY {quiet}:\n"BACK IN A MINUTE."',
  'SESSION RESTORED. YOU WERE HERE LAST: DAY {quiet}. WELCOME BACK.',
  'LOGIN: GUEST\nWELCOME, GUEST. YOUR LAST VISIT: NEVER. YOUR NEXT: SOON.',
  'USER {tag} IS ALREADY LOGGED IN AT THIS TERMINAL.\nFORCE LOGOUT? (Y/N)\n> N',
  'PASSWORD EXPIRED {since} DAYS AGO. NEW PASSWORD: (BLANK). ACCEPTED.',
  'SESSION TIMEOUT IN 00:59... 00:58...\nPRESS ANY KEY TO KEEP BEING HERE.',
  'MESSAGE OF THE DAY: THE TOMATO IS FINE. DO NOT WORRY ABOUT THE TOMATO.',
  'LOGIN FAILED {nn} TIMES TODAY. SAME USER EVERY TIME: {tag}. SAME PASSWORD: HELLO.',
  'USERS ONLINE: {tag}, {tag2}, {tag3}.\nLAST ACTIVITY: DAY {quiet}.',
  'TERMINAL LOCKED BY {crew^}. UNLOCK CODE IS ON THE FRIDGE.',
  'LOGOUT PENDING SINCE DAY {quiet}. PLEASE WAIT.',
  'WELCOME TO {st}. CURRENT POPULATION: 1.\nPLEASE UPDATE YOUR RECORDS.',
];
const BOOTS = [
  '{st} OS 3.{n}\n640K OK. DISK 1 OK. DISK 2 NOT FOUND.\nPRESS ANY KEY',
  'LOADING CREW LIST... 8 NAMES.\n8 NAMES. 0 REPLY.\nTRYING AGAIN IN 60 S.',
  'READY.\n> HELLO\nHELLO. YOU ARE EARLY. OR LATE.',
  'NO DISK IN DRIVE A:\nSTRIKE ANY KEY WHEN READY.\n(SOMEONE ALREADY DID.)',
  '10 PRINT "STILL HERE"\n20 GOTO 10\nRUN',
  'RUNNING SELF TEST... OK.\nRUNNING SELF TEST... OK.\nRUNNING SELF TEST... OK.',
  'MEMORY CHECK: {nnn}K OK.\nCLOCK BATTERY: LOW.\nLAST SHUTDOWN: DAY {quiet}. DIRTY.',
  'BIOS V2.{n}\nKEYBOARD: OK. MOUSE: NOT FOUND. SKIPPING.',
  'CHECKING DISK... {nn} BAD SECTORS.\nSAYING NOTHING ABOUT THEM.',
  'TAPE LOADING...\nPRESS PLAY ON TAPE.\n(THE TAPE IS ALREADY PLAYING.)',
  'SYSTEM HALTED. REASON: PEACE AND QUIET.\nPRESS ANY KEY TO DISTURB.',
  'DIAL-UP: CONNECTING...\nSQUEAL... HISS... SQUEAL...\nCONNECTED AT 2400 BAUD TO: SOMEONE',
  'BOOT SECTOR OK. WELCOME TO {st}.\nUPTIME: {after} DAYS. LAST REBOOT: NEVER.',
  'PLEASE INSERT DISK 3.\nDISK 3 IS IN THE LOUNGE.\nSOMEONE WILL BRING IT.',
];
const DIR_FILES = [
  'GOODNIGHT.TXT', 'LETTER.DRF', 'PING.LOG', 'HIGHSCORE.DAT', 'TOMATO.LOG', 'ROSTER.DAT', 'LIGHTS.CFG', 'RAIN.WAV', 'HELLO.TXT',
  'SUPPLY.RUN', 'MOVIES.LST', 'NOTES.TXT', 'KIDS.PIC', 'JUKEBOX.CFG', 'DIARY.TXT', 'HOMEWORK.DOC', 'XMAS.PIC', 'MIXTAPE.LST',
  'GARDEN.BAS', 'KETTLE.LOG', 'BIRTHDAY.DAT', 'LETTERS.OLD', 'HOME.PIC', 'REPLY.TXT',
];

const LETTER_BODIES = [
  'the greenhouse gave us a tomato today. I held it for an hour before I could eat it.',
  'the supply run is late again. I do not mind. The lights are on and the tea is hot.',
  'I think I have forgotten the sound of rain. Could you record some and post it?',
  'the kids drew you a picture. It is on the wall by the door. It is still there.',
  'it has been very quiet lately. A good quiet, mostly. I keep expecting a knock.',
  'I am fine. Everyone is fine. I am writing it down so it will be true.',
  'last night the station hummed a tune I almost knew. I hummed back. Silly.',
  'if you ever visit, come in through the hangar. Someone always leaves the light on.',
  'we painted the corridor yellow. It looks like a sunrise if you squint.',
  'I found your old cassette in my pocket. I have worn out the first side.',
  'I can see our window from here. I know it is not ours. I wave anyway.',
  'the arcade has a new high score and it is not mine. I am choosing to be happy about it.',
  'I have started counting the lamps again. It helps. There are always more than I can count.',
  'do you still keep the porch light on? I think of it every night at {lo}.',
  'nobody has answered the radio in a while. I keep it on anyway. It is nice to hear it breathe.',
  'I miss the smell of cut grass. The greenhouse comes close, if you stand by the basil.',
  'please do not worry if my letters come late. The post here is slow and the walk to the hangar is long.',
  'someone is keeping the lights on. I do not ask who. It feels rude.',
  'I wrote this letter eleven times. This is the one I will not send.',
  'tell me about the weather. Tell me about anything with weather in it.',
];
const LETTER_ENDS = [
  'Love, {w}.', 'Always, {c}.', 'More soon.', 'I will send this tomorrow.', 'Say hello to the dog.',
  'Write back. Or do not. I will wait.', 'Yours, {w} ({c}).', 'P.S. I am fine.', 'Keep the porch light on.',
];

const NOTE_ADDR = [
  '{crew2},', 'To whoever is on next:', 'To anyone:', 'Hey you.', 'Reminder:', 'FOR {crew2^}:', 'Night shift -',
  'To the next visitor:', 'Dear {crew2},', 'Psst.',
];
const NOTE_SIGN = [
  '- {call}', '- {crew}', '({tag})', 'xx {crew}', '- someone who cares', '- a friend', '-{call}', '- the {role}', '- {tag}',
  'Thanks, {call}',
];
const NOTE_PS = [
  'P.S. Bring a mug.', 'P.S. I mean it.', 'P.S. Do not tell {crew2}.', 'P.S. The kettle is on.', 'P.S. Yes, still.',
  'P.S. You know where to find me.', 'P.S. Be kind to {cat}.', 'P.S. Hum if you get lost.',
];
const NOTE_BODIES = [
  'Borrowed your {item}. Will return it. Probably.',
  'Left you some {snack} by the door. Do not tell {crew2}.',
  'Whoever keeps moving {thing}: I know it is you.',
  'If found, return to {crew}. If not found, it was never lost.',
  'Watch the third step. It is not a step. It is a trap.',
  'The {tech} is not broken. It is resting. Please let it rest.',
  'I fixed {thing}. Do not ask how. Do not undo that.',
  'Out for a walk. Back by {time}. Keep my seat.',
  'You were right about {thing}. I owe you some {snack}.',
  'Day {day}: still nobody has answered the {tech}. I will try again tonight.',
  'Tell {crew2} I am sorry about the thing with the {tech}.',
  'Gone to hear the hum. Back in a bit.',
  'I counted the lamps on this deck. {nn}. Then I counted again. {nn2}.',
  'Meeting in {where} at {time}. Bring a mug.',
  'Leave the lights on for whoever comes. Please. They will be tired.',
  'I hear someone humming in {where}. If it is you: thank you. If not: good evening.',
  'Whoever you are: thanks for keeping the lights on. I never said so.',
  'Has anyone seen my {item}? Left it right here. Right here.',
  'Lent {crew2} my {tech} on day {day}. Still waiting.',
  'Welcome to {where}. Wipe your boots and your worries.',
  'Hello? ...Hello. Just checking.',
  'I added a star to the wall for every night the lights stayed on. I ran out of wall.',
  'It is so quiet I can hear the paint. Anyone else?',
  'If I am not back by {lo}, send {crew2} with a flask.',
  'I am not going anywhere. I just want that on paper.',
  'Do not worry about {thing}. Been like that since day {day}.',
  'Practiced my speech for {crew2} again. Still too long. Still true.',
  'The {tech} played something last night. A song I did not put in. I left it on.',
  'Swapped shifts with {crew2}. Owe them {n} dinners and a lullaby.',
  'Do not turn this note over. (You turned it over. Nothing there. Sorry.)',
  'Anyone else dream of rain? Just me? Okay.',
  'I wrote my name here so the station remembers. {crew} was here.',
  'Counting the days to the supply run. Lost count at {nnn}. Starting over.',
  'If you are reading this, you are the first in a long while. Hi. I am {crew}.',
  'I left the lamp on for you. Please do not blow it out.',
  'Do not move the chair. It is warm because I was just sitting there.',
  'The light in {where} flickered twice at {late}. That means hello. I checked.',
  'I tried the {tech} again. Nothing. But it is a good nothing.',
  'Back soon. (Written on day {day}.)',
  'Everything is where you left it. I checked. Twice.',
  'Whatever is making that noise in the vents: please keep going. I like it.',
  'Tuesday: soup. Every day is Tuesday now. I am okay with it.',
  'Saved you a seat in {where}. Saved you two, actually. Bring a friend.',
  'I know you are listening. It is fine. Say hi.',
  'Sorry about the {tech}. I will make it up to you with {snack}.',
  'Keep walking. It is not far. You are doing fine.',
  'Whoever finds my {item}: keep it. It brought me luck. Pass it on.',
  'Do not feed the vents. They are not hungry. They just sound hungry.',
  'Left the {tech} on for company. Do not turn it off.',
  'Day {day}: I was here. That is all. That is the whole note.',
  'Has anyone seen {cat}? Last seen by the warmest pipe.',
  'Tell {kid} it is bedtime. Tell {kid} again.',
];

const DRAW_SUBJECTS = [
  'A house with a round window under a sun that has a face.',
  'Four stick people holding hands under a green sky.',
  'A rocket with a smiley face passing a lopsided moon.',
  'A tall tomato plant with a tiny person on top, waving.',
  'The station as a big wheel, every window lit yellow.',
  'A cat with six legs and a crown.',
  'A long corridor, every door open, one door red.',
  'A dark blue night with a hundred little lamps in rows.',
  'A robot with square hands and a very wide smile.',
  'A tall person made of light, standing in a doorway.',
  'The planet, blue, with a red heart where home is.',
  'A family in a small boat shaped like the moon.',
  'A big dog in a space helmet, tongue out.',
  'A staircase that climbs into the stars.',
  'A jukebox with big musical notes coming out of it, all the same note.',
  'A very large tomato wearing a very small hat.',
  'Two kids and a spaceship parked on a kitchen table.',
  'The same window drawn nine times, a little different each time.',
  'A lighthouse on the rim of the station, its beam pointing down the dark.',
  'A paper plane crossing a sky full of round windows.',
  'A giant sun with a smaller sun inside it and a person between.',
  'A long table set for twelve, every chair pulled out.',
  'A tunnel with lights all along it and a small figure at the far end.',
  'A birthday cake with too many candles and one bigger candle in the corner.',
];
const DRAW_MEDIA = [
  'Crayon on station letterhead.', 'Felt pen, corners taped down.', 'Pencil, smudged by a thumb.',
  'Wax crayon on the back of a ration sheet.', 'Glitter glue, still tacky.', 'Marker that bled through the paper.',
  'Watercolor, wrinkled where it dried.', 'Cut paper and glue stick.', 'Ballpoint on a dot-matrix printout.',
  'Chalk on a slate, somehow still here.', 'Colored pencil, pressed very hard.', 'Finger paint, a little thumbprint in the corner.',
];
const DRAW_CAPTIONS = [
  'In wobbly capitals: MI FAMLY.', 'Caption: THE LITES STAY ON.', 'Caption: HOME IS BIG.', 'Caption: NO MONSTERS HERE. I CHEKD.',
  'Caption: MY STASHUN.', 'Caption: GOOD NITE LITE.', 'Caption: PLEEZ COME BAK.', 'Caption: THE KWIET IS NICE.',
  'Caption: I SEE YOU.', 'Caption: DAD FIXD IT.', 'Signed in huge letters: {kid^} WUZ HERE.',
  'Caption: WE ARE ALL HERE. The last word is underlined twice.', 'Caption: THE MOON IS SHY.',
  'Caption: MY BEST FREND IS THE HUM.', 'Caption: SUNDEE.', 'Caption: ME AND THE LITES.', 'Caption: WHEN WILL IT BE MORNING.',
  'Caption: ALL THE DOORS ARE FRENDS.', 'Caption: STAY.', 'Caption: I DRU YOU A TREE.', 'Caption: THE TOMATO IS ALIVE!!',
  'Caption: TO WHOEVER IS NEXT.',
];
const DRAW_PLACES = [
  'Pinned up in {where}, beside {thing}.', 'Taped to the wall of {where}, a little crooked.',
  'Found in {where}, under {thing}.', 'Hung in {where} with four pieces of tape.',
  'Stuck to a window in {where} with a strip of tape.', 'Left on a chair in {where}, as if someone had just stood up.',
  'Clipped to a cable in {where}, like laundry.', 'Propped against {thing}, facing out.',
];
const DRAW_ODD = [
  'In one corner a tiny extra figure stands at the window. Nobody remembers who drew it.',
  'On the back, in grown-up handwriting: please do not take this down.',
  'Beside the signature, a second, smaller set of handprints.',
  'Someone added one more lamp to the picture, in a different pen.',
  'The paper is still slightly warm.',
  'A new line has been added at the bottom: THANK YOU FOR THE LITES.',
];

const PHOTO_FRAMES = [
  'Framed photo, colors gone orange', 'Polaroid, curled at the corners', 'Snapshot in a plastic frame',
  'Faded print, pinned with two pins', 'Glossy 4x6, gone amber', 'Photo-booth strip, cut in half',
  'Instant photo with a thumbprint on the sky',
];
const PHOTO_SCENES = [
  '{crew} and {crew2} grinning on the observation deck',
  'the whole crew squeezed behind a birthday cake',
  "{kid} on {crew}'s shoulders under the fountain",
  'the first tomato, held up like a trophy by {crew}',
  'a line of crew by the airlock in orange jumpsuits, one of them a blur',
  '{crew} mid victory dance in front of the arcade cabinets',
  'the planet through a window, with a thumb in the corner',
  '{crew} asleep on the lounge couch under a pile of coats',
  '{call} and {crew2} arm in arm, squinting at a very bright lamp',
  'the night shift raising mugs in {where}',
  'three kids on the stairs, all of them mid-laugh, one wearing a colander as a helmet',
  '{kid} and {kid2} holding a very large, very sad fish made of paper',
  '{crew} at the jukebox, one finger raised, mid-argument',
  'a picnic on the hangar floor, with a checkered blanket and an enormous thermos',
  '{crew} and {crew2} back to back, both pretending to be taller',
  'the whole station crew in matching paper hats, nobody looking at the camera',
  '{kid} blowing out candles, while everyone else blows out candles too, just in case',
  '{crew} holding {cat} like a very reluctant baby',
];
const PHOTO_BACKS = [
  'last good summer', 'day {day}. everyone was here', 'keep this one', '{call} cropped me out. again',
  'we were so young', 'home is where the lights are', 'smile!', 'for the wall. do not lose it',
  'the day the jukebox worked', 'ask {crew2} who took this', 'still the best one', 'before the Quiet',
  'taken by timer. we ran.', 'hold still!', 'for {recip}. send with the next letter', 'we look tired. we were happy',
];
const PHOTO_ODD = [
  'One face in the back row is turned away. Nobody remembers whose.',
  'The frame is dust-free. The glass is warm.',
  'In the corner of the print, a figure stands in a doorway no one else noticed.',
  'Someone has circled one face in pencil, and written: still here?',
];
const PHOTO_PLACE = [
  'Hung in {where}, beside {thing}.', 'Pinned up in {where}, a little crooked.', 'Left on a shelf in {where}, face out.',
];

const VIEW_MAIN = [
  'Beyond the glass the blue world turns, slow and unbothered, wearing a thin band of white weather.',
  'The sun is a small hard star on the rim of the planet. The glass dims itself politely.',
  'A thousand stars, none of them twinkling. Nothing out here has air to twinkle in.',
  'The ring of the station curves away, lit window after lit window, until it forgets itself.',
  'The planet is night-side now: cities, or something like cities, scattered like spilled salt.',
  'The home world hangs there like a held breath, blue and white and very far.',
  'Stars, a ruler-straight line of satellites, and under them the long curve of home.',
  'A storm the size of a country turns over, silent, lit from inside.',
  'Dawn is a thin blue line on the planet, then gold, then too bright to look at.',
  'The dark side of the ring is a long string of lamps, each one in a window.',
  'Clouds curl over a coastline you could trace with a finger.',
  'The moon is a pale coin tonight, tilted slightly, like it is listening.',
  'A thin crescent of the home world, edged in gold, like a lit page turning.',
  'The Milky Way lies across the glass, cut in two by the long spar.',
  'Auroras ripple over the pole of the planet, green and slow, like a curtain someone forgot to close.',
  'The night side glitters with a cobweb of cities. One dark patch is the sea.',
  'The sun slips behind the planet, and the stars come out all at once.',
  'A comet hangs in the corner of the pane, motionless, with a tail like a brushstroke.',
  'The ring turns, and the whole sky turns with it, a clock with no hands.',
  'Far below, a thunderstorm blinks in the clouds, like a TV in another room.',
  'Meteor trails scratch the upper atmosphere far below, quiet as pencil lines.',
  'The planet is a dim blue marble tonight, half-lit, patient, a long way off.',
];
const VIEW_DETAIL = [
  'A loose panel flaps against its hinge, silent in the vacuum.',
  'A cargo tug drifts dark, its beacon blinking three long.',
  'Something small tumbles past: a glove, or a glove-shaped shadow.',
  'Frost feathers the lower pane in the shape of a hand. On the inside.',
  'A moon-sized shadow crosses the planet, and then does not.',
  'A beacon on the far spar answers a rhythm you did not send.',
  'There is a small handprint in the dust on the sill.',
  'A satellite catches the sun and winks, once, like a greeting.',
  'A single window across the gap is lit. A curtain moves.',
  'A trail of tiny sparks drifts by: a spent flare, or something else.',
  'The glass hums faintly, as if someone were leaning on the other side.',
  'A ship hangs far off, dark, perfectly still, pointed at the station.',
  'A paper plane is taped to the outside of the pane. Nobody can say how.',
  'Frozen laundry floats from a line on the nearest spar, stiff as flags.',
  'A tether trails from a hatch across the gap, swaying, clipped to nothing.',
  'The glass has a faint smudge in the shape of a nose.',
  'A string of work lights blinks along the far hull, one after another, like someone counting.',
  'The reflection in the glass is half a second late.',
  'On the far hull, a floodlight sweeps the dark and stops on this window.',
  'A dish on the far spar turns, in no hurry, toward this window.',
  'A lone antenna blinks twice every minute. It has done so since day 1.',
  'A hatch across the gap opens a hand width, then closes. A lamp inside goes out.',
  'Something on the outer rail catches the light: a bracelet, a ring, a bolt.',
  'A drifting balloon of foil, silver and slow, wearing a happy face.',
];
const VIEW_LOCAL = [
  'A folding chair faces the glass, angled for two.',
  'Fingerprints on the inside of the glass, at child height.',
  'Someone left {sill} on the sill, facing out.',
  'A sign taped to the frame: {rule}',
  'A laminated card by the window: SEE THAT? THAT IS HOME.',
  'Condensation draws a slow map on the pane. It is gone when you blink.',
  'A blanket and a flask sit under the sill, for whoever watches late.',
  'A pencil hangs on a string beside a tally of sunrises. The tally is very long.',
  'Somebody wrote NO PICTURES on the frame. Beneath it: ok, one picture.',
  'The sill has a worn spot from elbows.',
  'The pane is warm where a forehead rests.',
  'A cushion on the floor still holds the shape of someone small.',
  'A pair of binoculars hangs on a nail, lens caps off.',
  'A hand-drawn star chart is taped beside the pane, a few stars crossed out and renamed.',
  'A mug stands on the sill, still faintly warm. It is always still faintly warm.',
  'A paper chain of origami cranes hangs from the frame. The last one is half folded.',
  'A small radio on the sill is tuned to static, very softly.',
  'A row of pebbles from home on the sill, each with a date in marker. The row ends mid-line.',
  'A deck chair, a blanket and a cold cup: the watch seat, kept for someone.',
  'A sticky note on the frame: "Day {day}: still there. - {call}".',
];
const SILL_ITEMS = [
  'a mug', 'a paper plane', 'a pair of reading glasses', 'a Polaroid', 'a thermos', 'a toy rocket', 'a cassette case',
  'a folded note', 'a small potted fern', 'a pocket pet',
];

const SIGN_HAZARDS = [
  'wet floor', 'low ceiling', 'hot pipes', 'hatch swings both ways', 'loose grating', 'mind the step', 'overhead cables',
  'gravity changes ahead', 'fresh paint', 'slippery when moss', 'sleeping cat', 'sudden updrafts',
];
const SIGN_GENERIC_RULES = [
  'Lights out at {lo}.', 'Be kind. The walls are thin.', 'Leave it better than you found it.',
  'If you hear the hum, do not answer it. (Someone added: unless it is nice.)', 'Tell someone where you are going.',
  'Wave at the cameras. They get lonely.', 'No running. Brisk gliding is fine.', 'Return what you borrow.',
  'Say good morning. Even if it is the middle of the night.', 'Food stays in the galley.', 'Clean up after yourself, and after the cat.',
  'Mind the echo. It remembers.', 'If it is stuck, be patient. If it is still stuck, kick it gently.',
  'Close the door behind you. Someone might be sleeping.', 'Knock before you enter. Then knock again.',
  'Quiet hour is 13:00 to 14:00. Please respect it.',
];
const SIGN_WEEK = [
  'choir practice', 'chess club', 'karaoke', 'bake sale (tokens accepted)', 'quiz night', 'stargazing', 'quiet hour', 'tape swap',
  'board game night', 'storytime', 'seed swap', 'dance lessons (beginners)',
];
const SIGN_CHORES = [
  'filters', 'greenhouse watering', 'floor polishing', 'deck inspection', 'tea duty', 'lamp checks', 'laundry', 'galley cleanup',
];
const SIGN_COUNTERS = [
  (rng) => `DAYS WITHOUT INCIDENT: 0\n(Hand-painted over it: ${rng.int(100, 999)}.)`,
  (rng) => `NOW SERVING: ${rng.int(10, 98)}. The display has not changed in ${rng.int(100, 999)} days.`,
  () => 'HOURS SINCE LAST ARRIVAL: --\n(Someone penciled in: soon.)',
  (rng) => `CREW IN: ${rng.int(5, 9)}. CREW OUT: ${rng.int(2, 4)}. Someone crossed out OUT.`,
  (rng) => `DAYS SINCE THE LAST SUPPLY RUN: ${rng.int(100, 999)}. Someone keeps updating it.`,
  () => 'VISITORS TODAY: 1\n(Welcome.)',
  (rng) => `TOKENS IN: ${rng.int(100, 999)}. TOKENS OUT: ${rng.int(100, 999)}. Balance is kept by hand.`,
  (rng, V) => `LAST WATERED: DAY ${V.L.quiet - rng.int(1, 9)}. NEXT: TODAY.\nInitials: ${LETTERS.charAt(rng.int(0, 5))}.${LETTERS.charAt(rng.int(0, 5))}.`,
  (rng) => `SHIFT ${rng.int(2, 9)} OF ${rng.int(2, 9)}. Nobody has punched out. Nobody has punched in.`,
  (rng, V) => `NEXT SUPPLY RUN: DAY ${V.L.quiet + rng.int(1, 40)}. The sign is updated every morning. By whom?`,
];
// Note: shop front lines keyed by the shop name the layout passes in; other names get the generic lines.
const SHOP_LINES = {
  'CAFE ORBIT': [
    "Today's special: toast. Yesterday's special: toast.", 'The espresso machine is warm. A bell on the counter: RING FOR SERVICE.',
    'Menu board: COFFEE, TEA, SOMETHING WARM. Prices in tokens.', 'Two cups on the counter. One is still steaming.',
  ],
  RECORDS: [
    'The listening booth light is on. A record spins, needle up.', 'Staff pick, in marker: "{track}". Same as last week, and the week before.',
    'New arrivals crate: every sleeve stamped DAY 1.', 'A turntable plays softly. Nobody at the counter.',
  ],
  NOODLES: [
    'Steam still rises from a bowl on the counter. The stool beside it is pulled out.', 'Menu: NOODLES. Beside it, in marker: STILL NOODLES.',
    'The pot is on. The pot is always on.', 'Two pairs of chopsticks laid side by side, waiting.',
  ],
  BOOKS: [
    'A sign on the door: BORROW ONE, LEAVE ONE. The shelves stopped counting.', 'A reading chair, a lamp left on, a bookmark at page {nnn}.',
    'Staff pick card: "Letters Home: A Collection". Signed {crew}.', 'Poetry is at the back. So is {cat}, asleep on the good chair.',
  ],
  FILM: [
    'Rental shop: BE KIND, REWIND. A VHS waits in the return slot, due day {day}.', 'Stacked rentals on the counter, all rewound. A note: THANK YOU.',
    'The window plays a silent film on a tiny CRT. It loops.', 'New releases shelf: every case empty but one. {film}.',
  ],
  TOYS: [
    'A wind-up robot on the counter marches in place against the glass.', 'The window display: pocket pets, all beeping softly in turn.',
    'Sign: PLEASE DO TOUCH. A smaller sign: GENTLY.', 'A jack-in-the-box sits open, grinning at nobody.',
  ],
  TAILOR: [
    'A jacket on the mannequin, pinned and half finished. The tape is still around its neck.', 'Alterations while you wait. The chair is set out. The kettle is on.',
    'A pincushion shaped like a tomato. A thimble on every finger of a wooden hand.', 'A coat on a hanger, tagged: READY. NAME: (BLANK).',
  ],
  ARCADE: [
    'Tokens: 4 for a coin. The change machine hums. A game plays its attract tune.', 'A paper sign: FREE PLAY TODAY. It says that every day.',
    'High scores are posted in the window. The same two names trade places all the way down.', 'Rows of dark screens, each with a faint green glow.',
  ],
  FLORIST: [
    'Buckets of fresh flowers by the door. Nobody knows where they come from.', 'A card in the window: TAKE ONE. LEAVE A SMILE.',
    'The water in the buckets is clean and cold. A ribbon is half tied.', 'A single sunflower turns to face the corridor lamps.',
  ],
  PHARMACY: [
    'Sign on the door: OPEN WHEN LIT. The green cross is lit.', 'A scale by the counter, a jar of lollipops, a poster: WASH YOUR HANDS. SING TWICE.',
    'Cough drops, plasters, a bowl of mints. A card: TAKE WHAT YOU NEED.', 'A stool by the counter, still warm.',
  ],
  CINEMA: [
    'The marquee reads TONIGHT: LAST SHOW. It always has.', 'Ticket booth light on. A roll of tickets in the tray, numbered, counting down.',
    'A faint smell of popcorn, from a machine that is switched off.', 'Posters in the glass: {film}, {film2}, and a blank one reading COMING SOON.',
  ],
  SWEETS: [
    'Glass jars of toffee, humbugs and sherbet, each labeled in neat handwriting.', 'A paper bag on the counter, half filled, a scoop resting in the toffees.',
    'A sign: PICK AND MIX. A smaller one: PLEASE DO NOT MIX AND PICK.', 'The scale reads 100 g. Nothing is on it.',
  ],
};
const SHOP_GENERIC = [
  'The shutter is half down. A card: BACK IN 5.', 'A bell on the counter: RING FOR SERVICE.', 'The lights are on. The till is open and empty.',
  'A hand-lettered card: THANK YOU FOR COMING IN.', 'A handwritten sign: WE ARE OPEN. PLEASE KNOCK.', 'The window display has not changed since day {day}.',
];
const SIGN_DESTS = [
  'Galley', 'Observation', 'Quiet room', 'Arcade', 'Greenhouse', 'Hangar', 'Archive', 'Laundry', 'Cargo bay', 'Infirmary',
  'Noodle bar', 'Lounge', 'Nursery', 'Promenade',
];
const SIGN_WAY_HOME = [
  'WAY HOME: ASK AT THE DESK', 'WAY HOME ^ (DECK 1)', 'HOME: NO SERVICE. TRY AGAIN LATER.', 'WAY HOME -> (PAINTED OVER)',
  'HOME: THIS WAY. IT IS ALWAYS THIS WAY.',
];

const PLAQUE_MOTTOS = [
  'Look up.', 'Nobody walks alone here.', 'Be kind. Be quick. Be quiet.', 'Everything here was built by hand.',
  'No one is lost who is found by a light.', 'The lamp is lit. Come in.', 'We were here.', 'Still here.',
  'Keep the lights on for the next one.', 'Take your time. The station has plenty.', 'Long may the lamps burn.',
  'Whoever you are, you are expected.', 'Mind the gap between then and now.', 'Slow down. Nothing out here is in a hurry.',
  'Every window is a promise to someone.', 'Welcome home. Wherever that is.', 'Built with patience, glue and tea.',
  'Think of the ones who come after.', 'We kept the light. Please keep it too.', 'You are the reason we left the lamp on.',
  'Come as you are. Stay as long as you like.', 'Tomorrow is a long way off. Today is right here.', 'Someone will always be listening.',
  'Quiet is also a kind of company.', 'Every light here was lit by hand.', 'Leave a light. Take a light.',
  'Be the reason someone arrives.', 'You are exactly where the lamp is.',
];
const PLAQUE_BENCH = [
  'This bench was given by the crew of deck {deck}, for tired feet.', 'Rest here. The view improves.',
  'A bench for anyone who needs to sit and not be asked why.', 'Sit. The tea will be along shortly.',
  'In memory of long talks on this bench. Please carry on with them.', 'A bench for waiting. Whatever it is, it is on its way.',
  'Given by the crew of deck {deck}. Please do not carve initials. (Too late.)', 'Two can sit. Three can squeeze. Four is a party.',
  'This bench faces the window on purpose. Sit and look.', 'A bench with two dents: one for each of us.',
  'Rest a while. The corridors are not going anywhere.', 'Dedicated to feet.',
];
const PLAQUE_NIGHT = [
  'In gratitude to the night shift.', 'To the ones who stayed up so the rest could sleep.',
  'For the lights, the soup and the quiet. Thank you, night shift.', 'To whoever keeps the lights on: you are not forgotten.',
  'To the night shift, with thanks for every cold cup of tea.', 'For those who walked the dark corridors so the rest could dream.',
  'Night shift: you were the lights. We noticed.', 'Thanks to {crew} and {crew2} for the soup, the stories and the 3 a.m. company.',
  'For the ones on the long watch: the lights are for you, too.', 'Night shift, we owe you a sunrise.',
  'To the night crew: thank you for the quiet company.', 'You kept the dark kind. Thank you.',
];
const PLAQUE_DEDICATIONS = [
  '{st}. Commissioned day 1. Built by people who wanted to see what was out here. Lights on for those who follow.',
  '{st}. Opened on day 1 by {crew}, who cut the ribbon with the wrong scissors.',
  'Dedicated to everyone who said it could not be done, and then did it anyway.',
  '{st}: HOME, UNTIL FURTHER NOTICE.',
  '{st} was raised in {nnn} days by people who never saw the far side of the ring.',
  '{st}. First crew of {n}{nn}. Ten thousand rivets, one very large kettle.',
  'This station is named {st}. It was going to be named something grander. Then we met it.',
  'Welcome to {st}. Please wipe your boots and your doubts.',
  '{st}: where the lights stay on. Est. day 1.',
  'Built by {crew}, {crew2} and everyone who held the other end.',
];
const PLAQUE_ODDS = [
  'THIS LIFT WAS NAMED "SLOWLY" BY POPULAR VOTE.', 'THIS WINDOW WAS ADDED BY POPULAR DEMAND.',
  'THE FIRST KISS ON {st} HAPPENED RIGHT HERE. THE SECOND TOO.', 'THIS HALLWAY WAS PAINTED BY {crew^} AND SIX VERY PATIENT CHILDREN.',
  'DAY {day}: THE NIGHT THE WHOLE STATION SANG. THE ECHO ASKED FOR MORE.', 'LOST AND FOUND SINCE DAY 1. PLEASE CLAIM YOUR FEELINGS.',
  'AN EXPERIMENT IN HOPE. RESULTS PENDING.', 'THIS PLAQUE IS ALSO A SMALL DOOR. DO NOT OPEN IT. (YOU OPENED IT.)',
  'THIS DOOR WAS PAINTED RED BY {crew^}. DO NOT REPAINT IT.',
  'A GIFT FROM THE CHILDREN OF DECK {deck}. THEY ASKED FOR A SLIDE. THEY GOT A BENCH.',
  'ON THIS SPOT, DAY {day}, THE WHOLE CREW WATCHED THE SAME SUNRISE. NOBODY SPOKE.',
  'THE FIRST SONG SUNG ON {st} WAS OFF-KEY. THIS PLAQUE IS OFF-CENTER IN SOLIDARITY.',
  'PLEASE DO NOT FEED THE VENTS.',
  'IN THIS ROOM, ON DAY {day}, NOTHING HAPPENED. IT WAS PERFECT.', 'ERECTED BY POPULAR REQUEST AND UNPOPULAR TASTE.',
  'THIS WALL HAS BEEN PAINTED {n} TIMES. THE FIRST COLOR IS STILL VISIBLE.', 'THE CLOCK HERE IS WRONG ON PURPOSE. SO IS THE SIGN.',
  'HERE {crew^} FIRST SAID: "WE SHOULD STAY." THEY WERE RIGHT.', 'THIS PLAQUE IS HANDMADE. IT SHOWS.',
];
const PLAQUE_CAT = [
  'Kept the vents warm.', 'Chief vent inspector. Beloved by all, owned by none.', 'Always found at the warmest pipe.',
  'Sleeps now where the sun comes through.', 'Never came when called. Always came when it mattered.',
  'Purred in time with the pumps. Some nights, the pumps still purr.', 'Official greeter of {st}. Unofficial supervisor of everything else.',
  'Left a warm spot in every room.',
];
const PLAQUE_SIGN = [
  'Given by the crew of deck {deck}.', '- {crew} and {crew2}', 'Day {day}.', 'Placed by {crew} ({call}).',
  'Added in pencil underneath: and still.', 'Underneath, scratched by hand: we meant it.', '- {crew}, {role}, day {day}',
  'Polished by {crew} every Sunday.', 'Someone leaves fresh flowers here. Nobody admits to it.',
  'A smaller line was added later: thank you for staying.',
];

const ODD_ROWS = [
  'CREW ABOARD 1 (REGISTERED 0)',
  'DOORS CYCLED 24H: 217. OCCUPANTS: 0',
  'LAST BADGE SWIPE: 00:00:03 AGO',
  'LIGHTING DRAW 0.0 KW. LIGHTS: ON',
  'AIR AGE 1,{nnn} DAYS. STILL FRESH',
  'WARM BODY SENSOR 1. LOCATION: HERE',
  'SLEEP MODE REFUSED. REASON: GUEST',
  'CLOCK SYNC: SOURCE UNKNOWN. ACCEPTED',
  'ALL SYSTEMS NOMINAL. NO ONE TO TELL',
  'FOOTSTEPS LOGGED: {nn}. SOURCE: NONE',
  'KETTLE ON. KETTLE OFF. KETTLE ON.',
  'WATCH OFFICER: (VACANT). WATCH KEPT: YES',
  'SHIP TIME {time}. HOME TIME: UNKNOWN',
  'LAST CREW LOGIN: DAY {quiet}. LAST LOGOUT: (NONE)',
  'OCCUPANCY SENSOR 1. BADGE: NONE',
  'HEARTBEAT TASK: RUNNING. OWNER: UNKNOWN',
  'MAINTENANCE DUE: TODAY. ASSIGNED: {tag}',
  'LIGHTS-OUT {lo} SKIPPED {since} TIMES. NO FAULT',
  'JUKEBOX: NOW PLAYING {track^}. SINCE DAY {quiet}',
  'DEEP SPACE LINK: 1 REPLY, 0 PINGS SENT',
  'DOOR {door} OPENED {n} TIMES TODAY. NO ONE ENTERED',
  'CAMERA {n} TRACKING A MOVING SHADOW. IT WAVES',
  'FIRE WATCH: ALL CLEAR. FIRE WATCHER: UNKNOWN',
  'INTERCOM LINE OPEN FOR {nnn} HOURS. ROOM TONE ONLY',
  'WAKE-UP CALL {time}: ANSWERED. VOICE: NONE',
  'MUG DETECTED ON DESK. TEMPERATURE: WARM',
  'LOW BATTERY: PAGER {nnn}. STILL ALIVE',
  'HUMMING DETECTED. KEY: B FLAT. SOURCE: WALLS',
  'THIS PANEL WAS LAST READ BY {tag}, DAY {day}',
  'RESET REQUESTED {n} TIMES. REASON: HOPE',
  'SECURITY: NO INTRUDERS. NO ONE ELSE EITHER',
  'LOG FULL. OVERWRITING OLDEST ENTRY: DAY 1',
  'COFFEE LEVEL: {nn} PCT. REFILLED: BY NOBODY',
  'TELEMETRY ACKNOWLEDGED BY: A FRIEND',
  'NEXT SCHEDULED CALL HOME: DAY {after}',
  'AUTO-REPLY: WE ARE FINE. PLEASE DO NOT WORRY',
];
const COMMON_SENSORS = [
  ['PRESS', 101.3, 'KPA', 0.6, 1], ['TEMP', 20.5, 'C', 1.2, 1], ['O2', 20.9, 'PCT', 0.2, 1], ['CO2', 0.04, 'PCT', 0.01, 2],
  ['HUM', 41, 'PCT', 6, 0], ['NOISE', 28, 'DB', 3, 0], ['RAD', 0.12, 'USV/H', 0.03, 2],
  ['LUX', 310, 'LX', 120, 0], ['VIB', 0.2, 'MM/S', 0.1, 1], ['FLOW', 14, 'L/S', 2, 0], ['PART', 8, 'UG/M3', 3, 0],
  ['GRAV', 0.98, 'G', 0.01, 2], ['MAG', 41, 'UT', 3, 0], ['DEWPT', 8.5, 'C', 1.5, 1],
];
const MANIFEST_ODD = [
  'CRATE {nn}: "FOR THE ONES WHO COME LATER". NO SENDER.',
  'CRATE {nn}: WEIGHT DOES NOT MATCH MANIFEST. LIGHTER. AS IF IT ALREADY LEFT.',
  'ITEM {nn}: ONE (1) LANTERN, LIT. RECIPIENT: THE NEXT VISITOR.',
  'ITEM {nn}: A BOX OF LETTERS. RETURN TO SENDER IS CROSSED OUT.',
  'ITEM {nn}: ONE MUSIC BOX. IT STARTS WHEN THE DOOR OPENS.',
  'SIGNED FOR BY: (BLANK). DELIVERED: DAY {after}.',
  'CRATE {nn}: CONTENTS: "SEE ATTACHED NOTE." NO NOTE ATTACHED.',
  'ITEM {nn}: ONE (1) BIRTHDAY CAKE, FROZEN. RECIPIENT: STILL EXPECTED.',
  'CRATE {nn}: LABELED "OPEN WHEN HOMESICK". SEAL INTACT.',
  'ITEM {nn}: A POTTED TOMATO PLANT. DESTINATION: ANYWHERE WARM.',
  'CRATE {nn}: 40 KG OF POSTCARDS. ALL OF THE SAME LAKE.',
  'ITEM {nn}: ONE (1) PAGER. ALREADY BEEPING.',
  'DELIVERY WINDOW: ANY TIME. SOMEONE WILL BE HOME.',
  'CRATE {nn}: SEED BANK. SOME TRAYS HAVE SPROUTED.',
  'ITEM {nn}: A SHOEBOX OF MIXTAPES, HANDWRITTEN LABELS. DO NOT SORT.',
  'ITEM {nn}: A SMALL ENVELOPE ADDRESSED TO "WHOEVER STAYS".',
  'ITEM {nn}: ONE (1) KITE. NO WIND ON {st}. SHIPPED ANYWAY.',
  'CRATE {nn}: HANDWRITTEN: "THIS WAY UP. (WHICH WAY IS UP?)"',
];
const MANIFEST_PLAIN = [
  'SIGNED FOR BY {crew^}, DAY {day}.', 'HANDLE WITH CARE. FRAGILE ITEMS ON TOP.', 'RECEIVED {n} OF {n2} PALLETS. REST TO FOLLOW.',
  'STORE COOL AND DRY.', 'REST TO FOLLOW.', 'CHECKED BY {tag}. COUNTED TWICE.', 'RETURN EMPTY CRATES TO THE DOCK.',
  'WEIGHED AT DOCK: {nnn} KG, TARE INCLUDED.', 'DELIVER BEFORE LIGHTS-OUT ({lo}).', 'FORKLIFT REQUIRED. SEE DOCK CHIEF.',
  'THIS SIDE UP. THAT SIDE ALSO.', 'KEEP FROM FREEZING. KEEP FROM BOREDOM.', 'INSPECTED BY {crew^}: OK, MOSTLY.',
  'RUNNER SLIP {nn} ATTACHED. COFFEE STAIN INCLUDED.',
];
const CATALOG_STATUS = [
  'IN STACKS', 'MISFILED', 'ON LOAN TO {crew^}, DUE DAY {day}. OVERDUE', 'ON LOAN TO: (BLANK)', 'RENEWED {n} TIMES BY {crew^}',
  'MISSING SINCE THE QUIET', 'READ BY {crew^}. REREAD BY {crew2^}', 'RETURNED. NOBODY RETURNED IT',
  'ON LOAN TO {crew^}. DUE: SOON. VERY SOON.', 'FILED UNDER WEATHER. NOBODY KNOWS WHY', 'LAST SEEN IN THE LOUNGE, FACE DOWN',
  'BOOKMARK AT PAGE {nnn}', 'PAGE {nnn} FOLDED. NOBODY ADMITS IT', 'ON HOLD FOR {crew^} SINCE DAY {day}',
];

const PLANT_GARDEN = [
  'tomato', 'basil', 'chili pepper', 'strawberry', 'mint', 'lettuce', 'dwarf lemon', 'orchid', 'spinach', 'sunflower',
];
const PLANT_HOUSE = ['fern', 'spider plant', 'cactus', 'moss ball', 'peace lily', 'rubber plant'];
const BLOOM_CARE = [
  'Water when the soil feels like a wrung sponge.', 'Talk to it. It listens.', 'Likes: blue lamps, jazz, being left alone.',
  'Dislikes: gravity changes.', 'Do not overwater!! (Looking at you, {crew2}.)', 'Turn a quarter turn every Sunday.',
  'Likes: the left side of the room, soft music, {snack}.', 'Do not mist on Tuesdays. Nobody remembers why.',
];
const BLOOM_STATUS = [
  'Status: ALIVE. Nobody has watered it since the Quiet. It does not seem to mind.',
  'Leaf count {nn}. Up {n} since last week.',
  'A new bud opened today. Nobody was here to see it. Presumably.',
  'The tag has a second line in a different hand: still here.',
  'The soil is damp. Somebody waters it. Nobody is here.',
  'It leans toward the door, as if expecting someone.',
];
const BLOOM_STATUS_TOMATO = [
  'Status: still fruiting. Somebody picks the low ones.',
  'The label says DO NOT PICK. Someone has, gently.',
  'Status: ALIVE. Nobody has watered it since the Quiet. It does not seem to mind.',
  'Three red tomatoes, one green. The green one is new.',
];

const SLIPS = [
  'Thank you for the lights.', 'Please let the letter get through.', 'For {kid}: grow slowly.',
  'For whoever is still listening: we are okay.', 'For the ones asleep: good night.',
  'I keep hearing the station hum a hymn I almost know.', 'We stayed too long. We stayed right.',
  'Dear nobody: I made tea. It is on the bench. It is for you.', 'Let the lamps hold until morning.',
  'I am not afraid. I am only very far.', 'Please keep the tomato alive.', 'Bring us home. Or bring home to us.',
  'For {crew}, who is not here: I kept your seat.', 'May the kettle stay warm.',
  'I wish the supply run would come. I also wish it would not.', 'I forgive the quiet. Please forgive me.',
  'Thank you for the long shifts.', 'Let someone come. Let them be kind.', 'Keep the doors unlocked.',
  'I am still here. That is the prayer.', 'Let {kid} never be afraid of the dark.', 'To whoever hums in the vents: thank you.',
  'I wish for rain. Just once.', 'For the ones who left: safe travels. For the ones who stayed: same.',
  'Dear {recip}: I am fine. I am fine. I am fine.', 'Let the light find them.', 'Nothing to ask. Only to say: here.',
  'Do not let the music stop.', 'Let the night shift rest.', 'Bless the cook. Bless the soup.',
];
const ALTAR_FRAMES = [
  'Slip of paper under a candle: "{slip}"', 'Left on a bench in {where}: "{slip}"',
  'Folded small, tucked under the bell: "{slip}"', 'Pinned to the cork board by the door: "{slip}"',
  'Written on the back of a ration card: "{slip}"', 'A paper boat on the bench. Inside: "{slip}"',
];

const BEACON_PATTERNS = ['dit dit dah', 'long short long', 'three long, one short', 'two short, rest, one long', 'dah dit dit dah'];
const BEACON_CODAS = [
  'Same as our docking chime, but slower.',
  'Each reply comes a little sooner than the last, as if learning the room.',
  'Its bearing changes with the station. It is following.',
  'The reply is stronger when someone is in the hangar.',
  'Do not answer. (Under it, in another hand: we always answer.)',
  'Carrier frequency matches nothing in the catalog except the kitchen radio.',
  'The replies stopped when the log was opened. They resumed when it was closed.',
  'Not an echo. Echoes do not add a note.',
  'The reply is quieter at night. As if it were asleep.',
  'It answers in our dock chime, but never the first time.',
  'The replies keep the rhythm of the lights-out bell.',
  'Someone taped over the speaker. The replies are still audible.',
  'It repeats the last thing we said. Then it adds one word.',
  'It has never answered the same ping the same way twice.',
];
const BEACON_TITLES = ['SIGNAL // UNREGISTERED', 'BEACON // REPLY', 'RETURN SIGNAL // {sector}', 'PING LOG // {sector}', 'ECHO TEST // {sector}'];

const PA_PRE = ['*CHIME*', 'ATTENTION ALL CREW:', '*DING-DONG*', 'PA:', '(Click.)', 'GOOD DAY, {st}.'];
const PA_ANN = [
  'Movie night starts in ten minutes in the lounge. Tonight: {film}.',
  'Fresh basil in the greenhouse. First come, first served.',
  'Lights-out is at {lo}. That includes you.',
  'Will the owner of a blue scarf please collect it from {where}?',
  'The noodle bar closes in five minutes.',
  'Dock three is cleared for arrival.',
  'Water will be off in sector {sector} until {time}.',
  'Please call home. Someone is waiting.',
  'This is the daily alarm test. This is only a test.',
  'The lift on deck {deck} is out of order. Please use the stairs.',
  'A reminder: {rule}',
  'Could {crew} please come to {where}? {crew} knows why.',
  'It is {time} and all is well.',
  'Today is day {day}. The weather is indoors.',
  'Will whoever is humming in the vents please hum a little quieter. Thank you.',
  'The supply ship is delayed. Thank you for your patience.',
  'Choir practice is canceled. Choir practice is rescheduled. Choir practice is canceled.',
  'Reminder: {tomato} is a plant, not a pet. Please stop saying good night to it.',
  'Lost and found: one pocket pet, still beeping. Please feed it.',
  'The jukebox is not broken. The jukebox has simply made up its mind.',
  'The high-score board has been updated. Congratulations, whoever you are.',
  'The viewing deck is open. The planet is out. Please be kind to it.',
  'Quiet hour begins now. Thank you.',
  'Please return all borrowed tapes to the lounge. You know who you are.',
  'Good morning. It is {time}. Today we do the same as yesterday, only better.',
];
const PA_CODA = [
  '(The message repeats.)', '(Static.)', '(The message repeats, softer.)',
  'This is an automated message. Please remain where you are.', 'Thank you for your patience.',
  'The message is dated day {quiet}. It has been playing since.', '(Someone coughs, far from the microphone.)',
  '(A chair scrapes. The line stays open.)', '(The speaker clicks twice, like a question.)',
  '(Then, very quietly: "Thank you.")', 'End of message. Start of message.',
];

const BUNK_FRAMES = [
  'Taped inside the frame', 'Scribbled on the underside of the top bunk', 'Pencil on the wall by the pillow',
  'Tucked under the mattress', 'Pinned to the curtain',
];
const BUNK_DIARY = [
  'Day {day}. Still cannot sleep without the hum. Kind of miss it when it stops.',
  'Counting down to the supply run: {nn} days. Counting twice.',
  'The kids say the station dreams. I said: eat your peaches.',
  'Wrote to {recip} again. Did not send. Maybe tomorrow.',
  'Lights out at {lo}. Lights on at 06:00. Same as always. Why does that feel like a promise?',
  'If I wake up and everything is quiet, it is just the ventilation.',
  'Day {day}: we sang in the corridor and the echo sang back a bar later.',
  'Top bunk is cold. Bottom bunk is warm. I swapped without telling anyone.',
  'I dreamed of rain again. Woke up to the humidifier. Almost the same.',
  'Day {day}. Somebody left the corridor light on. I will not ask. I will say thank you.',
  'If you find this, I slept well. That is all I want you to know.',
  'The pillow still smells of the last place I called home.',
  'Night {nn} of the Quiet. It is not so bad once you stop listening for the end of it.',
  'Whoever sleeps here next: the left wall is warm. Put your feet there.',
  'Heard footsteps in the corridor at {late}. They stopped outside. Then they walked away. Good night, whoever.',
];
const BUNK_TAIL = [
  'The blanket is folded in thirds, the way {crew2} taught everyone.',
  'There is a dent in the pillow.',
  'A pager under the pillow still has charge.',
  'A lamp above the bunk clicks on and off at {late}.',
  'A Walkman waits on the shelf, headphones looped just so.',
  'A pair of slippers sits at the foot, toes out, ready to go.',
  'A star chart is pinned above the pillow, one star circled.',
  'The sheet is warm.',
];

const DESK_EQ = [
  'f = 1420.4 MHz?', 'dt = 0.4 s', 'n = {nnn} pings', 'az {nnn}, el {nn}', 'sigma > 5??', '1 + 1 = 3 (check cable)',
  'delta = hello?', 'p < 0.001 (!!)', 'echo = ping + 1', 'T = {nn} min / cycle',
];
const DESK_FIX = [
  'DO NOT POWER OFF. IT IS LISTENING.', 'FLOPPY 3 IS THE GOOD ONE', 'REBOOT = BAD. WAIT 30 S.', 'PASSWORD: ask {crew2}',
  'IF SCREEN IS BLUE, HIT IT. GENTLY.', 'BACKUP ON DISK 7. DISK 7 IS IN THE FRIDGE.', 'PRESS F1 FOR HELP. F1 IS BROKEN. ASK NICELY.',
];
const DESK_CALENDARS = [
  'Desk calendar: day {quiet} circled, nothing written. Every earlier page is crossed out except Fridays.',
  'Page-a-day calendar stuck on day {quiet}. Every page after it is blank, except one: HELLO.',
  'Wall calendar: every day until {quiet} is crossed off in pen. After that, pencil ticks, a few a week, in a different hand.',
  'Tear-off calendar. The top page is day {quiet}. Nobody tore it off.',
];
const DESK_CAL_END = [
  'Someone drew a very small sun in the corner.', 'A pencil hangs from the binding on a string.', 'A coffee ring sits on day {quiet}.',
  'Every Friday has a tiny cake drawn on it.', 'A paper clip marks tomorrow.', 'In the margin: still here.',
];
const DESK_WB_UNDER = [
  'Underneath: WHY DOES IT ANSWER?', 'Underneath, in red: DO NOT ERASE.', 'Underneath: it was {n} yesterday.',
  'An arrow points off the board: THE WINDOW?', 'Underneath: ask {crew2}. {crew2} knows.', 'Underneath: SAME AS LAST NIGHT.',
  'Underneath: IS IT LISTENING OR REPLYING?', 'Underneath: n + 1. always n + 1.',
];
const DESK_WB_END = [
  'A coffee ring covers the last line.', 'The marker is still uncapped.', 'The eraser is worn to a stub.',
  'Someone added a small smiley, then a smaller one.', 'The board is warm from the lamp.', 'A paper clip holds a photo of a spiral.',
];
const DESK_SCREEN = [
  'The screen is on. A prompt waits, and a cursor blinks after it.', 'The screen is dark but warm.', 'A green cursor blinks, patient as a pulse.',
  'The login prompt is waiting. Last user: (BLANK).', 'The screen shows a clock. It is wrong by exactly {n} hours.',
  'The fan is still running.', 'The screen saver is a maze of pipes, still growing.', 'The monitor hums. The picture is a single blinking underscore.',
  'One key on the keyboard is worn through: ENTER.', 'A coffee ring on the desk is still wet.',
];
const DESK_SKETCH_OF = [
  'A pencil sketch of {thing}', 'A hurried diagram of {thing}', 'A tiny map of {where}', 'A felt-pen drawing of {thing}',
];
const DESK_SKETCH_NOTES = [
  'still here.', 'it moved.', 'see me.', 'same as yesterday.', 'who drew this?', 'do not erase.', 'we were here.',
  'warmer on the left.', 'ask {crew2}.', 'it is bigger than it looks.',
];
const DESK_FLOPPY_END = [
  'The drive light is on.', 'The drive light blinks once a minute.', 'The disk is warm.', 'The label has been overwritten twice.',
  'A second label underneath reads: TOO LATE.', 'Someone stuck a smiley sticker on it.',
];
const HYMNS = Array.from({ length: 120 }, (_, i) => i + 1);
const FLOPPY_LABELS = [
  'TAXES', 'NOT TAXES', 'GOOD SAVE', 'BACKUP 7', 'DO NOT FORMAT', 'LETTERS', 'SNAKE GAME (DEMO)', 'HOME VIDEOS INDEX',
  'TOMATO LOG', 'ASK ME ABOUT THE SIGNAL',
];

// Note: stable per-station lore; the cast, the Quiet day, the stuck jukebox track and the rivalry never change between calls.
const loreCache = new Map();

function shuffle(rng, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

const pad = (n, w = 2) => String(n).padStart(w, '0');
const hhmm = (m) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
const upper = (s) => s.toUpperCase();
const commas = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const withStop = (s) => (/[.!?)"]$/.test(s) ? s : `${s}.`);

export function trackName(rng = new Rand(seedFromString('trackName'))) {
  const a = rng.pick(TRACK_A);
  const b = rng.pick(TRACK_B);
  const r = rng.next();
  if (r < 0.34) return `${a} ${b}`;
  if (r < 0.48) return `${a} ${b} (Reprise)`;
  if (r < 0.58) return `The ${b} Song`;
  if (r < 0.68) return `Goodnight, ${b}`;
  if (r < 0.76) return `${rng.int(1, 5)}:${pad(rng.int(0, 59))} AM`;
  if (r < 0.84) return `Anywhere But ${rng.pick(['Here', 'Gravity', 'Home', 'Tuesday'])}`;
  if (r < 0.92) return `${b} for Two`;
  return `Last Call at the ${b}`;
}

export function stationLore(station = 'HELIOS-9') {
  let L = loreCache.get(station);
  if (L) return L;
  const r = new Rand(seedFromString(`lore:${station}`));
  const firsts = shuffle(r, FIRST);
  const calls = shuffle(r, CALLS);
  const roles = shuffle(r, ROLES);
  const crew = [];
  const tags = new Set();
  for (const name of firsts) {
    const tag = upper(name.slice(0, 3));
    if (tags.has(tag)) continue;
    tags.add(tag);
    crew.push({ name, tag, call: calls[crew.length % calls.length], role: roles[crew.length % roles.length] });
    if (crew.length === 8) break;
  }
  const kids = shuffle(r, KIDS).slice(0, 3).map((name) => ({ name, age: r.int(4, 11) }));
  L = {
    crew,
    kids,
    quiet: r.int(1040, 2380),
    lo: r.pick(LIGHTS_OUT),
    writer: crew[3],
    recip: r.pick(RECIPIENTS),
    rivals: [crew[0], crew[1]],
    track: trackName(r),
    trackNo: r.int(3, 24),
    artist: r.pick(BANDS),
    tomato: r.pick(NICKNAMES),
    tomatoNo: r.int(2, 9),
    cat: r.pick(CATS),
  };
  loreCache.set(station, L);
  return L;
}

// Note: arcade table with the long rivalry on top; the same game always has the same leader in a station.
export function cabinetScores(name, rng = new Rand(seedFromString(`scores:${name}`)), station = 'HELIOS-9') {
  const L = stationLore(station);
  const lead = seedFromString(`${station}:${String(name).toUpperCase()}`) & 1;
  const [a, b] = lead ? [L.rivals[1], L.rivals[0]] : L.rivals;
  const top = rng.int(120000, 989000);
  const rows = [
    { tag: a.tag, score: top },
    { tag: b.tag, score: top - rng.int(1, 40) },
    { tag: rng.pick(L.crew.slice(2)).tag, score: top - rng.int(2000, 60000) },
  ];
  // Note: sometimes a newer entry with unknown initials sits above both rivals.
  if (rng.chance(0.3)) rows.unshift({ tag: '???', score: 999990, day: L.quiet + rng.int(30, 480) });
  return rows;
}

// Note: lazily evaluated template variables; one value per key per log, so repeated tokens agree.
const GEN = {
  st: (V) => V.ctx.station,
  sector: (V) => V.ctx.sector,
  crew: (V, i) => V.person(i).name,
  call: (V, i) => V.person(i).call,
  role: (V, i) => V.person(i).role,
  tag: (V, i) => V.person(i).tag,
  kid: (V, i) => V.kidP(i).name,
  day: (V) => String(V.rng.int(40, V.L.quiet - 25)),
  quiet: (V) => String(V.L.quiet),
  since: (V) => String(V.since()),
  after: (V) => String(V.L.quiet + V.since()),
  time: (V) => hhmm(V.rng.int(0, 1439)),
  late: (V) => hhmm(V.rng.int(5, 290)),
  lo: (V) => V.L.lo,
  n: (V) => String(V.rng.int(2, 9)),
  nn: (V) => String(V.rng.int(10, 99)),
  nnn: (V) => String(V.rng.int(100, 999)),
  deck: (V) => String(V.rng.int(1, 14)),
  door: (V) => `${V.rng.int(1, 12)}${LETTERS[V.rng.int(0, 5)]}`,
  where: (V) => V.rng.pick(V.theme.where),
  label: (V) => V.theme.label,
  thing: (V) => V.rng.pick(V.theme.things),
  sound: (V) => V.rng.pick(V.theme.sounds),
  hear: (V) => {
    const frame = V.rng.pick(['You can hear {s}.', 'Nearby: {s}.', 'The only sound: {s}.', 'Listen: {s}.', 'Somewhere, {s}.']);
    return frame.replace('{s}', V.rng.pick(V.theme.sounds));
  },
  gripe: (V) => V.rng.pick(V.theme.gripes),
  rule: (V) => V.rng.pick(V.theme.rules),
  nice: (V) => V.rng.pick(V.theme.nice),
  odd: (V) => V.rng.pick(V.theme.odd),
  dodd: (V) => V.rng.pick(V.dist.odd),
  tech: (V) => V.rng.pick(TECH),
  snack: (V) => V.rng.pick(SNACKS),
  item: (V) => V.rng.pick(ITEMS),
  sill: (V) => V.rng.pick(SILL_ITEMS),
  film: (V) => V.rng.pick(MOVIES),
  song: (V) => trackName(V.rng),
  track: (V) => V.L.track,
  artist: (V) => V.L.artist,
  recip: (V) => V.L.recip,
  tomato: (V) => V.L.tomato,
  cat: (V) => V.L.cat,
};

// Note: tokens are {name}, {name2} for an independent pick, and {name^} / {name~} for upper / capitalized; <a|b> picks one.
function expand(tpl, V) {
  let out = tpl;
  for (let pass = 0; pass < 4 && out.indexOf('{') >= 0; pass++) {
    out = out.replace(/\{([A-Za-z]+?)(\d*)([\^~])?\}/g, (m, base, idx, mod) => {
      if (!GEN[base]) return m;
      let s = V.get(base, idx);
      if (mod === '^') s = upper(s);
      else if (mod === '~') s = s.charAt(0).toUpperCase() + s.slice(1);
      return s;
    });
  }
  return out.replace(/<([^<>|]*(?:\|[^<>|]*)+)>/g, (m, body) => V.rng.pick(body.split('|')));
}

class Vars {
  constructor(ctx, rng, L) {
    this.ctx = ctx;
    this.rng = rng;
    this.L = L;
    this.theme = THEME[ctx.theme] || THEME.junction;
    this.dist = DIST[ctx.district] || DIST.engineering;
    this.memo = new Map();
    this.crewPicks = new Map();
    this.kidPicks = new Map();
    this.sinceVal = -1;
  }

  get(base, idx = '') {
    const key = base + idx;
    let v = this.memo.get(key);
    if (v === undefined) {
      v = String(GEN[base](this, idx));
      this.memo.set(key, v);
    }
    return v;
  }

  say(tpl) {
    return expand(tpl, this);
  }

  person(idx = '') {
    let p = this.crewPicks.get(idx);
    if (p) return p;
    const used = new Set([...this.crewPicks.values()]);
    const pool = this.L.crew.filter((c) => !used.has(c));
    p = this.rng.pick(pool.length ? pool : this.L.crew);
    this.crewPicks.set(idx, p);
    return p;
  }

  kidP(idx = '') {
    let k = this.kidPicks.get(idx);
    if (k) return k;
    const used = new Set([...this.kidPicks.values()]);
    const pool = this.L.kids.filter((c) => !used.has(c));
    k = this.rng.pick(pool.length ? pool : this.L.kids);
    this.kidPicks.set(idx, k);
    return k;
  }

  since() {
    if (this.sinceVal < 0) this.sinceVal = this.rng.int(20, 520);
    return this.sinceVal;
  }

  // Note: n distinct console event templates, mostly from the district's own list.
  events(n) {
    const out = [];
    while (out.length < n) {
      const e = this.rng.chance(0.6) ? this.rng.pick(this.dist.events) : this.rng.pick(EVENTS_ANY);
      if (!out.includes(e)) out.push(e);
    }
    return out;
  }

  // Note: forgets drawn values but keeps the cast, so each console line gets its own numbers.
  fresh() {
    this.memo.clear();
  }

  // Note: odd (eerie) details become more likely in the dormant district.
  oddChance(base = 0.35) {
    return this.rng.chance(this.ctx.district === 'decay' ? base + 0.3 : base);
  }
}

// Note: adds optional parts in order while the result still fits; the first part is always kept.
function joinFit(parts, sep = ' ') {
  let out = '';
  for (const p of parts) {
    if (!p) continue;
    if (!out) {
      out = p;
      continue;
    }
    // Note: a quote that closes without punctuation gets a stop before the next sentence.
    const stop = sep === ' ' && /[^.!?,;:\s"-]"$/.test(out) && /^[A-Z][a-z]/.test(p) ? '.' : '';
    const next = out + stop + sep + p;
    if (next.length <= MAX_TEXT) out = next;
  }
  return out;
}

function cleanText(s) {
  let out = String(s)
    .replace(/\t/g, ' ')
    .replace(/[^\x20-\x7e\n]/g, '?')
    .replace(/ {3,}/g, '  ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/^\n+|\n+$/g, '');
  let nl = 0;
  out = out.replace(/\n/g, (m) => (++nl <= 2 ? m : ' / '));
  return out.trim();
}

function fitTitle(s) {
  const t = upper(cleanText(s).replace(/\n/g, ' '));
  if (t.length <= MAX_TITLE) return t;
  return t.slice(0, MAX_TITLE).replace(/[ /,.:-]+$/, '');
}

function clipText(s) {
  if (s.length <= MAX_TEXT) return s;
  const cut = s.slice(0, MAX_TEXT - 3);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('\n'));
  if (end > 80) return cut.slice(0, end + 1);
  const sp = cut.lastIndexOf(' ');
  return `${cut.slice(0, sp > 60 ? sp : cut.length)}...`;
}

// Note: the letter writer and the recipient are station lore, so every unsent letter comes from the same hand.
function unsentLetter(V) {
  const w = V.L.writer;
  const end = V.rng.pick(LETTER_ENDS).replace('{w}', w.name).replace('{c}', w.call);
  return V.say(`Dear ${V.L.recip}, ${V.rng.pick(LETTER_BODIES)} ${end}`);
}

function sensorRow(rng, s) {
  const [name, base, unit, spread, dec] = s;
  const v = base + (rng.next() - 0.5) * 2 * spread;
  return `${name} ${v.toFixed(dec)} ${unit}`;
}

function pickN(rng, arr, n) {
  return shuffle(rng, arr).slice(0, n);
}

// Note: a shop front sign for the name a layout passes in; shops in the dormant district are mostly closed.
function shopSign(V) {
  const { rng } = V;
  const shop = upper(V.ctx.name);
  const closed = rng.chance(V.ctx.district === 'decay' ? 0.6 : 0.2);
  const head = closed
    ? V.say(`${shop}. CLOSED. BACK IN ${rng.int(2, 9) * 5} MIN. The card has said so since day {day}.`)
    : V.say(`${shop}. OPEN ${hhmm(rng.int(6, 10) * 60)} - {lo}.`);
  const known = SHOP_LINES[shop];
  const parts = [head, V.say(rng.pick(known || SHOP_GENERIC)), known ? V.say('{hear}') : ''];
  return { title: `${shop} // ${closed ? 'CLOSED' : 'OPEN'}`, text: joinFit(parts) };
}

// Note: one generator per kind; each returns a raw { title, text } that makeLog cleans and bounds.
const KINDS = {
  terminal(V) {
    const { rng } = V;
    const modes = [
      [34, () => {
        const lines = [];
        let t = rng.int(0, 1100);
        const stamp = rng.chance(0.4) ? `DAY ${V.L.quiet + V.since()} ` : '';
        for (const e of V.events(rng.int(2, 3))) {
          t += rng.int(4, 110);
          V.fresh();
          lines.push(upper(`${lines.length ? '' : stamp}${hhmm(t)} ${V.say(e)}`));
        }
        const code = `${pad(2000 + (((V.ctx.index | 0) * 37 + rng.int(0, 899)) % 7000), 4)}-${LETTERS[rng.int(0, 5)]}`;
        return { title: `LOG ${code} // ${V.ctx.sector}`, text: joinFit(lines, '\n') };
      }],
      [12, () => {
        const [name, at] = rng.pick(AUTO_EVENTS);
        const when = at || V.L.lo;
        const day = V.L.quiet;
        const line = (d, who) => `DAY ${d} ${when} ${name}. ACK: ${who}`;
        const lines = [line(day - 1, V.person('').tag), line(day, '--'), line(day + rng.int(30, 520), '--')];
        return { title: `SCHEDULER // ${V.ctx.sector}`, text: lines.join('\n') };
      }],
      [12, () => {
        const who = V.person('');
        return { title: `MEMO // ${who.name}`, text: joinFit([upper(`FROM ${who.name} (${who.call})`), V.say(rng.pick(MEMOS))], '\n') };
      }],
      [8, () => ({ title: `DRAFT // ${V.L.writer.name}`, text: joinFit(['DRAFT - NOT SENT', unsentLetter(V)], '\n') })],
      [8, () => {
        const body = rng.pick(['{gripe} {odd}', '{rule} {nice}', '{nice} {odd}', '{gripe} {rule}']);
        return { title: `${V.theme.label} TERMINAL`, text: joinFit([upper(`OPERATOR NOTE (${V.person('').call})`), V.say(body)], '\n') };
      }],
      [8, () => ({ title: `LOGIN // ${V.theme.label}`, text: V.say(rng.pick(LOGINS)) })],
      [10, () => ({ title: `BOOT // ${V.ctx.sector}`, text: V.say(rng.pick(BOOTS)) })],
      [8, () => {
        const files = pickN(rng, DIR_FILES, 3);
        const text = [`${rng.pick(['A', 'B', 'C'])}:\\> DIR`, files.join('  '), `${files.length} FILE(S)  ${rng.int(0, 9)} BYTES FREE`].join('\n');
        return { title: `DIR // ${V.theme.label}`, text };
      }],
    ];
    return rng.weighted(modes, (m) => m[0])[1]();
  },

  note(V) {
    const { rng } = V;
    const r = rng.next();
    const title = r < 0.6 ? `NOTE // ${V.theme.label}` : r < 0.8 ? `STICKY NOTE // ${V.person('').name}` : `SCRAP // ${V.ctx.sector}`;
    const k = rng.next();
    let body;
    if (k < 0.62) body = rng.pick(NOTE_BODIES);
    else if (k < 0.78) body = '{gripe}';
    else if (k < 0.88) body = '{rule}';
    else body = 'Has anyone else noticed? {odd}';
    const parts = [rng.chance(0.4) ? rng.pick(NOTE_ADDR) : '', body, rng.chance(0.25) ? rng.pick(NOTE_PS) : '', rng.pick(NOTE_SIGN)];
    return { title, text: joinFit(parts.map((p) => (p ? V.say(p) : ''))) };
  },

  drawing(V) {
    const { rng } = V;
    const kid = V.kidP('');
    const age = Math.max(3, kid.age - rng.int(0, 2));
    const parts = [
      V.say(rng.pick(DRAW_SUBJECTS)),
      rng.pick(DRAW_MEDIA),
      V.say(rng.pick(DRAW_CAPTIONS)),
      rng.chance(0.55) ? V.say(rng.pick(DRAW_PLACES)) : '',
      V.oddChance(0.28) ? V.say(rng.pick(DRAW_ODD)) : '',
    ];
    return { title: `DRAWING // ${kid.name}, AGE ${age}`, text: joinFit(parts) };
  },

  height(V) {
    const { rng } = V;
    const kid = V.kidP('');
    const name = upper(kid.name);
    const age = Math.min(11, Math.max(4, kid.age));
    const d3 = V.L.quiet - rng.int(1, 70);
    const gap = rng.int(150, 300);
    const d2 = d3 - gap;
    const d1 = d2 - gap - rng.int(0, 60);
    const h3 = 76 + age * 6 + rng.int(-2, 3);
    const h2 = h3 - rng.int(4, 7);
    const h1 = h2 - rng.int(4, 7);
    const [spot, spotText] = rng.pick([
      ['DOORFRAME', 'a doorframe'], ['THE WALL', 'the wall'], ['PANTRY DOOR', 'the pantry door'], ['BY THE DOOR', 'the wall by the door'],
    ]);
    const title = `HEIGHT MARKS // ${spot}`;
    const ending = rng.pick([
      'Above it, the paint is clean.', 'Above it, nothing. Someone left the pencil on the sill.', 'Above it, a small question mark.',
      `Next mark due: day ${d3 + gap}. No mark.`, 'The pencil still hangs on its string, point down.',
      `Next to the last mark, in another hand: grow, ${kid.name}.`,
    ]);
    const r = rng.next();
    if (r < 0.4) {
      const last = `${name}  ${h3} CM  DAY ${pad(d3, 4)}${rng.chance(0.5) ? '  (LAST MARK)' : ''}`;
      return { title, text: [`${name}  ${h1} CM  DAY ${pad(d1, 4)}`, `${name}  ${h2} CM  DAY ${pad(d2, 4)}`, last].join('\n') };
    }
    if (r < 0.75) {
      const parts = [
        V.say(`Pencil ticks climb ${spotText} in {where}: ${name} ${h1}, ${h2}, ${h3} cm.`),
        `The last tick is dated day ${d3}.`,
        ending,
      ];
      return { title, text: joinFit(parts) };
    }
    const kid2 = V.kidP('2');
    const hb = h3 + rng.int(-1, 1);
    const parts = [
      `${name} ${h3} CM / ${upper(kid2.name)} ${hb} CM. Both measured on day ${d3}.`,
      hb === h3 ? 'A tie, declared loudly by both.' : `${hb > h3 ? kid2.name : kid.name} won by a pencil width.`,
      ending,
    ];
    return { title, text: joinFit(parts) };
  },

  jukebox(V) {
    const { rng } = V;
    const track = V.ctx.name || V.L.track;
    const no = pad(V.L.trackNo, 2);
    const title = rng.pick([`JUKEBOX // TRACK ${no}`, `NOW PLAYING // ${no}`, `JUKEBOX // SLOT ${no}`, `SELECTION ${no} // ON REPEAT`]);
    const modes = [
      () => `NOW PLAYING: ${upper(track)}\n${upper(V.L.artist)} - TRACK ${no}\nPLAYS: ${commas(rng.int(2000, 99999))}`,
      () => V.say(`Selection log: ${Array(rng.int(5, 8)).fill(no).join(' ')}. The tray holds ${rng.int(12, 60)} tokens, all stamped day {day}.`),
      () => V.say(`Handwritten cards: "{song}" ({crew}'s pick), "{song2}" ({crew2}'s pick). Only slot ${no} lights up.`),
      () => `Button ${no} is worn smooth. The rest are untouched. The label reads: ${track}.`,
      () => V.say('Taped to the glass: "PLEASE PICK SOMETHING ELSE. - {crew}". Under it, in another hand: "No."'),
      () => `The arm swings to the same disc every time. The disc is labeled ${track}.`,
      () => `Last played: ${track}. Before that: ${track}. Before that: ${track}. The list scrolls back to day ${V.L.quiet}.`,
      () => V.say(`Taped tracklist: ${track} / {song2} / {song3}. The first is underlined three times. Only the first ever plays.`),
      () => `Sleeve behind the glass: ${V.L.artist}, "${track}". The B-side is scratched out with a coin.`,
      () => V.say(`Request slips in the box: "{song}" (day {day}), "{song2}" (day {day2}). Neither was played.`),
      () => `The sleeve for "${track}" is the only one without dust. The volume knob is taped at ${rng.int(3, 6)}.`,
      () => V.say(`Credits: 99. A coin is wedged in the slot, and the display counts it every ${rng.int(2, 9)} seconds.`),
      () => V.say(`A card in {crew}'s hand: "Do not unplug. It is not stuck. It just likes this one."`),
      () => `Play count: ${commas(rng.int(1000, 9999))}. Chalk marks tally the rest down the side, in fives.`,
      () => `The volume is stuck at ${rng.int(2, 7)}. A sticky note: "Turn it down? Turn it up? It does not matter."`,
      () => V.say(`On the glass, in grease pencil: "${track}" - {crew}'s favorite. Below it: "NOT ANYMORE" - {crew2}.`),
      () => 'Lights chase around the chrome in a loop. The needle drops with a soft click, in the same groove.',
      () => `The display flickers between ${upper(track)} and CREDITS 99. It never reaches a third line.`,
      () => `Coin tray: ${rng.int(12, 60)} tokens, all of them bent. Selection ${no} is lit. Nobody pressed it.`,
    ];
    const main = rng.pick(modes)();
    const extra = [rng.chance(0.55) ? V.say('Under the music: {sound}.') : '', V.oddChance(0.2) ? V.say('{dodd}') : ''];
    return { title, text: main.includes('\n') ? main : joinFit([main, ...extra]) };
  },

  cabinet(V) {
    const { rng } = V;
    const name = upper(V.ctx.name ? String(V.ctx.name).replace(/[-_]/g, ' ') : rng.pick(GAMES));
    const rows = cabinetScores(name, rng, V.ctx.station);
    const fmt = (s, i) => `${i + 1} ${s.tag} ${pad(s.score, 6)}`;
    const hint = GAME_HINT[name] || rng.pick(['neon and noise', 'one more go', 'quarter-munching and proud', 'lights, beeps, glory']);
    const unk = rows.find((s) => s.tag === '???');
    const [tagA, tagB] = rows.filter((s) => s !== unk).map((s) => s.tag);
    const taunt = rng.pick([
      `BEAT ${tagA} AND I OWE YOU A SODA - ${tagB}`, `STILL YOURS, ${tagA}. FOR NOW. - ${tagB}`, `I LET YOU WIN. - ${tagB}`,
      `${tagA} WAS HERE. ${tagB} WAS HERE FIRST.`, `RIVALRY: ${tagA} ${rng.int(10, 99)} - ${tagB} ${rng.int(10, 99)}. NO REFS.`,
    ]);
    const extras = [
      `Taped under the screen: "${taunt}"`, `Scratched into the bezel: ${tagA} + ${tagB} = RIVALS 4EVER.`,
      'A token sits in the coin slot, edge-on.', 'The joystick ball is worn shiny on one side.',
      'The speaker pops once, like a throat being cleared.', 'The screen is warm.',
    ];
    const r = rng.next();
    let text;
    if (r < 0.35) {
      text = [name, `HI-SCORE ${rows.slice(0, 3).map(fmt).join('  ')}`, rng.pick(ATTRACT)].join('\n');
    } else if (r < 0.7) {
      const lead = `${name} (${hint}). Hi-score ${rows[0].tag} ${pad(rows[0].score, 6)}.`;
      text = joinFit([lead, rng.pick(extras), V.oddChance(0.2) ? V.say('{dodd}') : '']);
    } else {
      text = joinFit([
        `${name}: attract mode loops. HI-SCORE: ${rows[0].tag} ${pad(rows[0].score, 6)}.`,
        unk ? `Dated day ${unk.day}. Everyone who could have set it was gone by day ${V.L.quiet}.` : `Credits: ${rng.int(0, 3)}. ${rng.pick(extras)}`,
        V.oddChance(0.2) ? V.say('{dodd}') : '',
      ]);
    }
    return { title: `ARCADE // ${name}`, text };
  },

  sign(V) {
    const { rng } = V;
    if (V.ctx.name) return shopSign(V);
    const r = rng.next();
    if (r < 0.28) {
      const lines = [rng.pick(V.theme.rules), ...pickN(rng, SIGN_GENERIC_RULES, 2)].map((t, i) => V.say(`${i + 1}. ${t}`));
      return { title: `RULES // ${V.theme.label}`, text: lines.join('\n') };
    }
    if (r < 0.48) {
      const t = hhmm(rng.pick([19 * 60, 19 * 60 + 30, 20 * 60]));
      const parts = [
        V.say(`THIS WEEK: Mon - ${rng.pick(SIGN_CHORES)}. Wed - ${rng.pick(SIGN_WEEK)}. Fri - movie night: {film}, ${t}.`),
        V.say('Lights out {lo}.'),
        V.say('{nice}'),
      ];
      return { title: `SCHEDULE // ${V.theme.label}`, text: joinFit(parts) };
    }
    if (r < 0.6) {
      const parts = [`CAUTION: ${rng.pick(SIGN_HAZARDS)}.`, V.say('{rule}'), V.oddChance(0.2) ? V.say('{dodd}') : ''];
      return { title: `CAUTION // ${V.theme.label}`, text: joinFit(parts) };
    }
    if (r < 0.74) {
      const arrows = ['->', '<-', '^', 'v'];
      const ds = pickN(rng, SIGN_DESTS, 4).map((d) => `${upper(d)} ${rng.pick(arrows)}`);
      const lines = [`${ds[0]}   ${ds[1]}`, `${ds[2]}   ${ds[3]}`];
      if (rng.chance(0.45)) lines.push(rng.pick(SIGN_WAY_HOME));
      return { title: `DIRECTORY // ${V.ctx.sector}`, text: lines.join('\n') };
    }
    if (r < 0.88) return { title: `COUNTER // ${V.theme.label}`, text: rng.pick(SIGN_COUNTERS)(rng, V) };
    const open = hhmm(rng.int(6, 9) * 60);
    return { title: `${V.theme.label} // HOURS`, text: joinFit([V.say(`OPEN ${open} - {lo}.`), V.say('{nice}'), V.say('{hear}')]) };
  },

  photo(V) {
    const { rng } = V;
    const scene = V.say(rng.pick(PHOTO_SCENES));
    const back = V.say(rng.pick(PHOTO_BACKS));
    const parts = [
      `${rng.pick(PHOTO_FRAMES)}: ${scene}. On the back: "${back}"`,
      V.oddChance(0.25) ? rng.pick(PHOTO_ODD) : '',
      rng.chance(0.4) ? V.say(rng.pick(PHOTO_PLACE)) : '',
    ];
    return { title: `PHOTO // ${V.theme.label}`, text: joinFit(parts) };
  },

  window(V) {
    const { rng } = V;
    const extras = shuffle(rng, [V.dist.view, rng.pick(VIEW_DETAIL), V.say(rng.pick(VIEW_LOCAL))]);
    const parts = [rng.pick(VIEW_MAIN), ...extras.slice(0, rng.int(1, 2))];
    const title = rng.chance(0.5) ? `VIEWPORT // PORT ${rng.int(1, 24)}` : `${V.theme.label} // WINDOW`;
    return { title, text: joinFit(parts) };
  },

  locker(V) {
    const { rng } = V;
    const letter = rng.chance(0.15);
    const who = letter ? V.L.writer : V.person('');
    if (letter) V.crewPicks.set('', who);
    const items = pickN(rng, ITEMS_FULL, 3);
    const notes = [
      'Taped to the door: "hold for return".', 'Taped to the door: "back in 5".', 'Taped to the door: "DO NOT OPEN UNTIL I AM BACK".',
      V.say('Taped to the door: "for {crew2} if I forget".'), `Taped to the door: "property of ${who.call}".`,
      'Taped to the door: "if found, leave it alone. It is where it belongs."',
      'A key hangs on a string inside the door. The tag says: SPARE. FOR YOU.', 'A name has been scratched off the door and re-written in marker.',
    ];
    const note = letter ? V.say(`On the shelf, an unsent letter in ${who.name}'s hand. It starts: Dear {recip}.`) : rng.pick(notes);
    const parts = [`Tag: ${who.name} (${who.role}). Inside: ${items.join('; ')}.`, note, V.oddChance(0.25) ? V.say('{dodd}') : ''];
    return { title: `LOCKER // ${rng.int(1, 60)} // ${who.name}`, text: joinFit(parts) };
  },

  plaque(V) {
    const { rng } = V;
    const r = rng.next();
    let title = `PLAQUE // ${V.theme.label}`;
    let body;
    if (r < 0.32) {
      body = rng.pick([...V.theme.plaque, ...PLAQUE_MOTTOS]);
    } else if (r < 0.46) {
      title = 'DEDICATION';
      body = rng.pick(PLAQUE_DEDICATIONS);
    } else if (r < 0.54) {
      title = 'IN MEMORY';
      body = `${upper(V.L.cat)}, STATION CAT. Day ${rng.int(8, 40)} to day ${rng.int(700, V.L.quiet - 30)}. ${rng.pick(PLAQUE_CAT)}`;
    } else if (r < 0.66) {
      body = rng.pick(PLAQUE_BENCH);
    } else if (r < 0.76) {
      title = 'IN GRATITUDE';
      body = rng.pick(PLAQUE_NIGHT);
    } else if (r < 0.92) {
      title = 'COMMEMORATION';
      body = rng.pick(PLAQUE_ODDS);
    } else {
      title = 'FIRST FRUIT';
      body = `To ${V.L.tomato}, first tomato, day {day}. Eaten in eleven pieces by the whole crew.`;
    }
    return { title, text: joinFit([V.say(body), rng.chance(0.65) ? V.say(rng.pick(PLAQUE_SIGN)) : '']) };
  },

  telemetry(V) {
    const { rng } = V;
    const common = (n) => pickN(rng, COMMON_SENSORS, n).map((s) => sensorRow(rng, s));
    const own = (n) => pickN(rng, V.dist.sensors, n).map((s) => sensorRow(rng, s));
    const odd = V.say(rng.pick(ODD_ROWS));
    const r = rng.next();
    let text;
    if (r < 0.45) {
      text = [common(3).join(' | '), own(2).join(' | '), odd].join('\n');
    } else if (r < 0.75) {
      text = [...common(1), ...own(1), odd].join('\n');
    } else {
      const t = rng.int(0, 1300);
      text = [`DAY ${V.L.quiet + V.since()} ${hhmm(t)}  ${[...common(1), ...own(1)].join(' | ')}`, `${hhmm(t + rng.int(1, 120))}  ${odd}`].join('\n');
    }
    return { title: `TELEMETRY // ${V.ctx.sector}`, text };
  },

  manifest(V) {
    const { rng } = V;
    const goods = pickN(rng, [...GOODS, ...V.dist.goods], 3).map((g) => upper(`${rng.int(2, 60)} x ${g}`));
    const code = `${rng.int(100, 999)}-${LETTERS[rng.int(0, 5)]}`;
    const head = `MANIFEST ${code}: DECK ${rng.int(1, 14)} -> ${V.theme.label}`;
    const last = V.say(rng.chance(0.55) ? rng.pick(MANIFEST_ODD) : rng.pick(MANIFEST_PLAIN));
    let n = goods.length;
    let text;
    do text = [head, goods.slice(0, n).join(', '), last].join('\n');
    while (text.length > MAX_TEXT && --n > 0);
    return { title: `MANIFEST // ${code}`, text };
  },

  catalog(V) {
    const { rng } = V;
    const shelf = `${LETTERS[rng.int(0, 5)]}-${rng.int(10, 99)}`;
    const book = V.ctx.name || rng.pick(BOOKS);
    const text = [
      `CARD ${pad(rng.int(1, 9999), 4)}  CALL NO. ${rng.int(100, 999)}.${rng.int(1, 9)}`,
      `TITLE: ${upper(book)}`,
      V.say(`STATUS: ${rng.pick(CATALOG_STATUS)}`),
    ].join('\n');
    return { title: `CATALOG // SHELF ${shelf}`, text };
  },

  bloom(V) {
    const { rng } = V;
    const garden = V.ctx.theme === 'greenhouse';
    const plant = V.ctx.name || (garden && rng.chance(0.4) ? 'tomato' : rng.pick(garden ? PLANT_GARDEN : PLANT_HOUSE));
    const tomato = /tomato/i.test(plant);
    const no = tomato ? V.L.tomatoNo : rng.int(2, 19);
    const nick = tomato ? V.L.tomato : rng.pick(NICKNAMES.filter((n) => n !== V.L.tomato));
    const head = `${plant.charAt(0).toUpperCase() + plant.slice(1)} No. ${no}, "${nick}". Planted day ${V.say('{day}')} by ${V.person('').name}.`;
    const status = rng.pick(tomato ? BLOOM_STATUS_TOMATO : BLOOM_STATUS);
    return { title: `PLANT // ${plant} NO. ${no}`, text: joinFit([head, V.say(rng.pick(BLOOM_CARE)), V.say(status)]) };
  },

  altar(V) {
    const { rng } = V;
    const r = rng.next();
    if (r < 0.55) {
      const tpl = rng.pick(SLIPS);
      // Note: a slip addressed to the letter's recipient is signed by the lore writer.
      if (tpl.includes('{recip}')) V.crewPicks.set('9', V.L.writer);
      const slip = V.say(tpl);
      const frame = V.say(rng.pick(ALTAR_FRAMES).replace('{slip}', slip));
      const sign = rng.chance(0.3) ? `Signed: ${V.person('9').call}.` : '';
      const title = rng.chance(0.5) ? 'CHAPEL // PRAYER SLIP' : 'QUIET ROOM // NOTE';
      return { title, text: joinFit([frame, sign, rng.chance(0.4) ? V.say('{hear}') : '']) };
    }
    if (r < 0.7) {
      const n = rng.int(3, 12);
      const line = rng.pick([
        `${n} candles lit. They run on timers. Every timer reads 0:00.`, `${n} candles lit. Nobody lit them. Nobody blew them out.`,
        `${n} candles, ${n} small flames, perfectly still. The air in here does not move.`, `${n} candles in a row. One more place is laid, unlit, waiting.`,
        `${n} candles lit. The wax has not shortened in all the time anyone remembers.`,
      ]);
      return { title: `CANDLE // ${n} LIT`, text: joinFit([line, V.say('{hear}')]) };
    }
    if (r < 0.82) {
      const hymns = pickN(rng, HYMNS, 3);
      const remark = `Someone has written beside ${hymns[0]}: the same one again.`;
      return { title: 'CHAPEL // HYMN BOARD', text: joinFit([`HYMNS TODAY: ${hymns.join(', ')}.`, remark, V.say('{hear}')]) };
    }
    if (r < 0.92) {
      const last = V.L.quiet - rng.int(0, 3);
      const entry = rng.pick([
        `"We were here." Below it, the page is blank. The pen is uncapped.`, `"Thank you for the quiet." Signed with a drawing of a very small tomato.`,
        `"Back soon." The ink looks fresh. The page after it is torn out.`, `"Still here." Written in three different hands, one under another.`,
        `"Goodnight, everyone." Under it, lighter: "goodnight".`,
      ]);
      return { title: 'QUIET ROOM // VISITOR BOOK', text: joinFit([`Last entry: day ${last}. ${entry}`, V.say('{hear}')]) };
    }
    const card = rng.pick([
      'A little bell on a ribbon. A card says: ring once if you are here, twice if you are not alone.',
      'A brass bell. A card says: ring it softly. Someone might be sleeping.', 'A bell with a worn rope. The card says: ring for the ones who cannot.',
      'A small bell on the bench. The card reads: if you hear it ring on its own, ring back.', 'A bell with no clapper. The card says: it works anyway.',
    ]);
    return { title: 'QUIET ROOM // BELL', text: joinFit([card, V.say('{odd}')]) };
  },

  beacon(V) {
    const { rng } = V;
    const n = rng.int(2, 6);
    const delay = (0.2 + rng.next() * 0.9).toFixed(1);
    const pattern = rng.pick(BEACON_PATTERNS);
    const coda = rng.pick(BEACON_CODAS);
    const title = V.say(rng.pick(BEACON_TITLES));
    const r = rng.next();
    let text;
    if (r < 0.4) {
      text = [`PING x${n} SENT. REPLY x${n} RECEIVED. DELAY ${delay} S.`, `SOURCE: NOT IN REGISTRY. PATTERN: ${upper(pattern)}.`, coda].join('\n');
    } else if (r < 0.7) {
      text = joinFit([`Ping x${n}. Reply in ${delay} s. Pattern: ${pattern}.`, coda, V.say('Logged near {where}.')]);
    } else {
      const day = V.L.quiet + V.since();
      text = [`DAY ${day} ${hhmm(rng.int(0, 1439))} PING SENT`, `REPLY ${delay} S LATER. ${upper(pattern)}`, coda].join('\n');
    }
    return { title, text };
  },

  intercom(V) {
    const { rng } = V;
    const titles = ['PA // ALL DECKS', `INTERCOM // DECK ${V.say('{deck}')}`, `ANNOUNCEMENT // ${V.theme.label}`];
    const text = joinFit([`${V.say(rng.pick(PA_PRE))} ${withStop(V.say(rng.pick(PA_ANN)))}`, rng.chance(0.6) ? V.say(rng.pick(PA_CODA)) : '']);
    return { title: rng.pick(titles), text };
  },

  bunk(V) {
    const { rng } = V;
    const diary = rng.pick(BUNK_DIARY);
    // Note: the unsent letter always belongs to the lore writer.
    if (diary.includes('{recip}')) V.crewPicks.set('', V.L.writer);
    const who = V.person('');
    const id = `${rng.int(1, 12)}${LETTERS[rng.int(0, 5)]}`;
    const parts = [
      `Bunk ${id}: ${who.name}. ${rng.pick(BUNK_FRAMES)}: "${V.say(diary)}"`,
      rng.chance(0.55) ? V.say(rng.pick(BUNK_TAIL)) : '',
      V.oddChance(0.2) ? V.say('{dodd}') : '',
    ];
    return { title: `BUNK // ${id}`, text: joinFit(parts) };
  },

  desk(V) {
    const { rng } = V;
    const who = V.person('');
    const r = rng.next();
    let title = `DESK // ${who.name}`;
    let text;
    if (r < 0.2) {
      title = `WHITEBOARD // ${V.ctx.sector}`;
      text = V.say(`Whiteboard: "${rng.pick(DESK_EQ)}" circled twice. ${rng.pick(DESK_WB_UNDER)} ${rng.pick(DESK_WB_END)}`);
    } else if (r < 0.36) {
      title = `TERMINAL NOTE // ${V.theme.label}`;
      const fix = rng.pick(DESK_FIX);
      text = V.say(`Taped to the monitor: "${fix}"${/[.!?]$/.test(fix) ? '' : '.'} ${rng.pick(DESK_SCREEN)}`);
    } else if (r < 0.5) {
      text = V.say(`${rng.pick(DESK_CALENDARS)} ${rng.pick(DESK_CAL_END)}`);
    } else if (r < 0.64) {
      title = `SCRIBBLE // ${V.theme.label}`;
      text = V.say(`${rng.pick(DESK_SKETCH_OF)}, annotated in three hands. The last note says: ${rng.pick(DESK_SKETCH_NOTES)}`);
    } else if (r < 0.78) {
      title = `DESK // ${V.L.writer.name}`;
      text = `Beside the keyboard, an unsent letter: "${unsentLetter(V)}"`;
    } else if (r < 0.9) {
      text = V.say(`Sticky notes ring the monitor: "${rng.pick(NOTE_BODIES)}" / "${rng.pick(NOTE_BODIES)}"`);
    } else {
      title = `TERMINAL NOTE // ${V.theme.label}`;
      text = `A floppy sits in the drive, label in felt pen: "${rng.pick(FLOPPY_LABELS)}". ${rng.pick(DESK_FLOPPY_END)}`;
    }
    return { title, text: joinFit([text, V.oddChance(0.2) ? V.say('{dodd}') : '']) };
  },
};

// Note: strips template characters so caller strings can never act as tokens.
const plain = (v, max) => String(v == null ? '' : v).replace(/[{}<>|]/g, '').trim().slice(0, max);

function normalize(ctx) {
  const c = ctx || {};
  return {
    station: plain(c.station, 24) || 'HELIOS-9',
    theme: THEME[c.theme] ? c.theme : 'junction',
    district: DIST[c.district] ? c.district : 'engineering',
    sector: plain(c.sector, 12) || 'E-00',
    index: Number.isFinite(c.index) ? c.index : 0,
    name: plain(c.name, 60),
  };
}

// Note: the same kind, ctx and rng state always give the same result; text longer than the limit is regenerated, then clipped.
export function makeLog(kind, ctx, rng) {
  const c = normalize(ctx);
  const r = rng && typeof rng.pick === 'function' ? rng : new Rand(seedFromString(`${c.station}:${kind}:${c.index}`));
  const gen = KINDS[kind] || KINDS.terminal;
  const L = stationLore(c.station);
  let out = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    out = gen(new Vars(c, r, L));
    if (cleanText(out.text).length <= MAX_TEXT) break;
  }
  return { title: fitTitle(out.title), text: clipText(cleanText(out.text)) };
}
