import { STORAGE_KEY } from './config';
import {
  DEFAULT_PLAY_SETTINGS,
  applyPlaySettingsToLine,
  formatTrackLines,
  type PlaySettings,
} from './utils/gameLogic';

export type ParticleKind = 'petals' | 'snow' | 'stars' | 'embers' | 'fireflies' | 'bubbles' | 'none';

export interface World {
  id: string;
  name: string;
  subtitle: string;
  sky: [string, string];
  fog: string;
  block: string;
  island: string;
  grass: string;
  particles: ParticleKind;
  gravity: number;
  prompts: string[];
}

/** Default number of lines drawn for one Journey / Ghost track. */
export const LINES_PER_TRACK = 3;

/** One line per row. Base prompts are lowercase letters and spaces; PlaySettings dynamically transforms them. */
const lines = (block: string) => block.split('\n').map(l => l.trim()).filter(Boolean);

// The first three lines of each original world stay intact so legacy ghosts saved without text match.
export const WORLDS: World[] = [
  {
    id: 'sky',
    name: 'Sky Gardens',
    subtitle: 'Floating cherry meadows & warm morning winds',
    sky: ['#8ec8ff', '#ffd2eb'],
    fog: '#cfe6ff',
    block: '#4c7dff',
    island: '#c9a27a',
    grass: '#7ed982',
    particles: 'petals',
    gravity: 1,
    prompts: lines(`
      soft clouds drift over the quiet garden
      every word you type becomes a bridge
      the wind hums a gentle tune today
      little islands float in the morning light
      take a breath and find your rhythm
      petals spin slowly in the warm breeze
      a kite climbs high above the green hills
      sunlight spills across the floating meadow
      step by step the path grows beneath you
      birds trace lazy circles in the blue
      the garden wakes with dew on every leaf
      follow the stream to the edge of the sky
      clover and moss cover the old stone steps
      a paper boat sails across a pond of clouds
      the morning smells of rain and fresh mint
      bees wander between rows of bright tulips
      every letter lands with a soft little thud
      the bridge ahead is built from your words
      swallows dive past the hanging vines
      keep a steady pace and enjoy the view
      a warm breeze carries the scent of jasmine
      windmills turn slowly on the far island
      ivy climbs the arches of the sky temple
      lanterns sway above the garden gate
      slow hands make the smoothest music
      cherry blossoms drift down like pink snow
      the horizon glows with peach and gold
      dandelion seeds ride the gentle wind
      a quiet mind types the cleanest lines
      the clouds below look like a sea of cotton
    `),
  },
  {
    id: 'neon',
    name: 'Neon Grid',
    subtitle: 'Synthwave horizons & electric cyber arches',
    sky: ['#1e0638', '#ff3b9a'],
    fog: '#3d0e54',
    block: '#ff2ced',
    island: '#2d1554',
    grass: '#00f0ff',
    particles: 'stars',
    gravity: 1,
    prompts: lines(`
      chrome sunsets glow on the endless grid
      synth waves pulse beneath your feet
      the city never sleeps in neon dreams
      drive into the violet horizon tonight
      pixels shimmer like rain on glass
      laser lines race toward the vanishing point
      the arcade hums with electric color
      palm trees sway against a magenta sky
      a cassette clicks and the bass rolls in
      midnight traffic paints ribbons of light
      the skyline flickers in pink and teal
      every keystroke lights another tile
      retro stars blink over the data highway
      turn up the volume and ride the rhythm
      holograms dance above the rooftop pool
      the grid stretches farther than you can see
      warm static crackles on the late night radio
      chrome letters gleam under purple lamps
      a neon sign buzzes outside the diner
      the future looks a lot like the past
      glide through the tunnel of glowing arches
      the dashboard glows a soft electric blue
      rain turns the street into a mirror
      the beat drops as the sun dips low
      high scores scroll across the old screen
      speed lines blur at the edge of the night
      the moon hangs like a disco ball
      a slow groove carries you down the coast
      vapor trails fade behind the last train
      tape hiss and thunder fill the summer air
    `),
  },
  {
    id: 'ice',
    name: 'Icy Peaks',
    subtitle: 'Crystal glaciers & northern aurora ridges',
    sky: ['#d6effd', '#7aa9d6'],
    fog: '#e4f4ff',
    block: '#38bdf8',
    island: '#d9ecf7',
    grass: '#ffffff',
    particles: 'snow',
    gravity: 1,
    prompts: lines(`
      snowflakes settle on the frozen ridge
      crisp air sparkles above the glacier
      quiet peaks wear coats of silver frost
      each step crunches on fresh powder
      the north wind whispers old stories
      icicles chime softly under the cabin roof
      a fox leaves small prints across the snow
      the lake sleeps beneath a sheet of glass
      breath turns to mist in the pale light
      pine trees bow under heavy white coats
      the aurora ripples above the summit
      warm cocoa waits at the end of the trail
      the mountain holds its breath at dawn
      frost draws ferns on the window pane
      slow and steady across the frozen bridge
      snow owls glide without a single sound
      the valley glitters like scattered sugar
      a wool scarf flutters in the cold breeze
      blue shadows stretch across the drifts
      the stars look closer from up here
      smoke curls from a chimney far below
      every word leaves a footprint in the snow
      the glacier creaks and settles in the night
      sunlight breaks through the falling flakes
      winter teaches patience to the hurried
      the trail winds between towers of ice
      a sled glides quietly down the hill
      the sky turns rose above the white peaks
      gloves off for a moment to feel the snow
      silence falls as softly as the snowfall
    `),
  },
  {
    id: 'sunset',
    name: 'Amber Dunes',
    subtitle: 'Golden canyon mirages & sunlit obelisks',
    sky: ['#ff7e47', '#ffd470'],
    fog: '#ffba7a',
    block: '#f97316',
    island: '#c26d3a',
    grass: '#f5b851',
    particles: 'embers',
    gravity: 0.95,
    prompts: lines(`
      golden sand ripples under the desert sun
      canyon walls glow like polished copper
      a warm mirage shimmers on the far horizon
      ancient obelisks cast long evening shadows
      caravans follow the stars across the dunes
      wind carves arches into the red sandstone
      an oasis blooms with palms and cool water
      sunlight turns every grain of sand to gold
      the desert breathes a deep and timeless calm
      red mesas stand guard above the quiet valley
      heat waves dance along the stone bridge
      amber lanterns flicker inside the nomad tent
      step lightly across the sunbaked terracotta tiles
      falcons soar high on the rising thermal air
      twilight paints the canyon in crimson and violet
      old ruins hold the memory of forgotten songs
      cool night air arrives as the sun sinks low
      the compass points toward the hidden spring
      dust motes swirl like sparks in the amber beam
      steady hands build a road across the canyon
      date palms rustle beside the turquoise pool
      the horizon stretches wide and unbroken here
      every footstep echoes against the canyon rim
      brass wind chimes ring in the dry evening breeze
      starlight slowly replaces the warm desert glow
      the sandstone arch frames a sky of burning orange
      travelers rest beneath the shade of the canyon wall
      time flows like sand through an ancient hourglass
      let your rhythm carry you across the golden waste
      the sun bows low and crowns the dunes in fire
    `),
  },
  {
    id: 'bamboo',
    name: 'Jade Sanctuary',
    subtitle: 'Misty emerald groves & glowing lantern shrines',
    sky: ['#134e4a', '#6ee7b7'],
    fog: '#348f7c',
    block: '#10b981',
    island: '#3f6253',
    grass: '#34d399',
    particles: 'fireflies',
    gravity: 0.92,
    prompts: lines(`
      tall bamboo stalks sway in the emerald mist
      paper lanterns float along the mossy stream
      raindrops patter softly on the temple roof
      fireflies weave ribbons of gold through the grove
      koi fish circle beneath the arched wooden bridge
      incense smoke curls toward the canopy above
      green moss blankets the ancient stone lanterns
      a bronze bell rings once across the quiet valley
      mist rises from the warm mountain hot spring
      each keystroke places a polished jade stepping stone
      cranes stand still in the shallow mirror pond
      the forest listens with a calm and patient heart
      wind whispers through ten thousand bamboo leaves
      tea steams gently in a porcelain cup at dawn
      red torii gates mark the winding mountain trail
      the waterfall sings a steady song over smooth rocks
      fern fronds uncurl in the filtered emerald light
      peace settles over the shrine like morning dew
      walk with balance across the floating timber path
      dragonflies hover above the blooming water lilies
      old cedar trees guard the entrance to the glade
      moonbeams filter through the swaying green stalks
      every breath brings clarity and effortless flow
      fireflies gather where the mountain streams meet
      the sanctuary rewards a calm and steady rhythm
      soft mist wraps the distant peaks in silk
      wooden chimes clack softly in the mountain breeze
      step across the jade bridge into deeper stillness
      nature writes its poetry in moss and running water
      find your center and let the words flow free
    `),
  },
  {
    id: 'volcano',
    name: 'Obsidian Forge',
    subtitle: 'Basalt spires, magma rivers & anvil sparks',
    sky: ['#1f0808', '#991b1b'],
    fog: '#451010',
    block: '#ef4444',
    island: '#292524',
    grass: '#ea580c',
    particles: 'embers',
    gravity: 1.05,
    prompts: lines(`
      sparks rise from the heart of the obsidian forge
      rivers of magma carve through dark basalt stone
      every keystroke strikes like a hammer on the anvil
      molten gold pours through the ancient foundry channels
      ash and embers drift across the crimson sky
      obsidian pillars tower above the glowing caldera
      heat radiates from the runes along the bridge
      forge your path through fire and blackened rock
      the mountain rumbles with a deep primal rhythm
      crystals of ruby and amber glint in the cavern wall
      iron chains swing above the roaring furnace pit
      smoke billows from the crown of the volcano
      steady courage carries you over the lava chasm
      each letter cools the magma into solid stone
      flames dance along the edges of the iron road
      the great bellows breathe life into the glowing coals
      lavastone islands float on a sea of liquid fire
      strike while the iron glows bright orange and white
      thunder echoes inside the hall of the fire titans
      red lightning arcs across the ash cloud canopy
      temper your speed with precision and control
      glowing fissures trace patterns across the dark crust
      the anvil rings out with a clear metallic tone
      cinder winds sweep past the jagged basalt peaks
      nothing endures without passing through the flame
      molten droplets sizzle as they meet the cool air
      the forge master watches from the obsidian throne
      build an unbreakable bridge across the fiery deep
      sparks spiral upward toward the smoky heavens
      claim victory at the summit of the burning peak
    `),
  },
  {
    id: 'ocean',
    name: 'Coral Abyss',
    subtitle: 'Bioluminescent reefs & drifting pearl currents',
    sky: ['#042f49', '#0891b2'],
    fog: '#064e6e',
    block: '#06b6d4',
    island: '#1e3a5f',
    grass: '#22d3ee',
    particles: 'bubbles',
    gravity: 0.75,
    prompts: lines(`
      silver bubbles rise through the sapphire deep
      bioluminescent coral glows in the quiet current
      manta rays glide like shadows overhead
      sunbeams pierce the surface of the turquoise sea
      kelp forests sway in a slow underwater waltz
      pearls shimmer inside giant shells on the reef
      the tide carries a gentle and weightless rhythm
      jellyfish drift past like glowing silk lanterns
      ancient sunken arches rest on the sandy floor
      schools of neon fish dart between the coral spires
      every word sends a ripple through the blue lagoon
      sea turtles cruise lazily along the warm current
      the ocean floor sparkles with mother of pearl
      anemones wave their soft petals in the tide
      whale songs echo from the deep blue canyon
      drift effortlessly from one coral island to the next
      starfish cling to the pillars of the sunken temple
      water softens every step into a graceful leap
      cyan and violet lights pulse along the abyssal rim
      follow the trail of bubbles toward the sunlit shoal
      seahorses curl around the swaying golden reeds
      the current knows the way if you trust the flow
      a sunken galleon sleeps beneath a blanket of coral
      shimmering scales catch the filtered midday light
      deep water holds a stillness like no other place
      shells chime together in the gentle undertow
      let the buoyancy of the sea lift your hands
      aquamarine arches frame the endless ocean vista
      breathe deep and glide across the luminous reef
      the abyss glows brightest for those who keep moving
    `),
  },
  {
    id: 'cosmic',
    name: 'Cosmic Void',
    subtitle: 'Zero-gravity nebulae & ringed astral monoliths',
    sky: ['#05031a', '#2b1b5c'],
    fog: '#120a33',
    block: '#9b7bff',
    island: '#3b2f6b',
    grass: '#ffd36e',
    particles: 'stars',
    gravity: 0.55,
    prompts: lines(`
      stars bloom in the silent void
      gravity loosens its gentle grip here
      comets trace silver lines through the dark
      drift between galaxies one letter at a time
      the universe listens as you type
      a small moon follows you through the night
      nebula clouds glow in violet and gold
      every star is a lantern for the lost
      time moves slowly at the edge of space
      planets turn like marbles in the dark
      stardust gathers on the path ahead
      the quiet out here is deep and kind
      float past the rings of a sleeping giant
      distant suns hum an ancient lullaby
      your words become a bridge of light
      a satellite blinks hello from far away
      the milky way pours across the sky
      weightless steps on a road of letters
      orbit the moment and let it carry you
      meteors scatter like sparks from a fire
      the dark is not empty it is resting
      an astronaut waves from a tiny window
      constellations tell stories without words
      somewhere a new star opens its eyes
      the horizon curves and the earth glows blue
      silence wraps around you like a blanket
      cosmic dust dances in the solar wind
      follow the pulse of a far off beacon
      one small step and then another
      the void hums softly and you hum back
    `),
  },
];

export const ZEN_WORDS = Array.from(
  new Set(
    `
  calm breeze river light gentle bloom moss stone cloud drift flow quiet morning lantern meadow ocean petal echo glow
  hush willow ember dawn tide feather maple velvet orbit pebble harbor wander silver amber honey cedar lotus misty
  brook creek stream pond lake shore coast cove bay reef dune sand shell wave ripple splash rain drizzle mist fog dew
  frost snow ice glacier puddle rainbow thunder shower cascade spring lagoon marsh delta oasis
  peak ridge summit valley canyon cliff cave hollow grove forest woods branch twig leaf fern ivy vine root bark seed
  sprout blossom tulip daisy lily rose orchid poppy clover thistle lavender jasmine sage mint basil thyme ginger pine
  birch aspen oak elm spruce bamboo reed orchard garden pasture prairie hill field
  sky sun moon star comet planet galaxy nebula cosmos aurora twilight dusk sunrise sunset horizon zenith eclipse
  shadow shade halo meteor lunar solar
  sparrow robin finch heron crane swan dove owl wren lark otter fox deer hare rabbit fawn koi turtle whale dolphin
  firefly moth cricket bee butterfly dragonfly kitten puppy lamb pony seal penguin panda
  blanket pillow candle tea kettle cocoa cinnamon vanilla biscuit bread butter cotton linen wool quilt hearth cabin
  cottage porch window attic library notebook pencil paper ink letter story poem song melody chorus rhythm tempo
  chord whistle lullaby slipper sweater scarf mitten teapot cookie muffin pancake
  peace still serene tender soft warm cool fresh clear bright mellow kind patient steady simple easy happy joyful
  grateful hopeful dreamy sleepy cozy snug smooth silky fluffy crisp airy hazy glassy mossy leafy sunny rainy windy
  breezy snowy starry cloudy dewy golden rosy
  breathe rest float glide sway swing stroll roam ramble linger listen whisper murmur ponder wonder imagine dream
  gather mend weave knit paint sketch plant water grow rise settle unfold unwind smile laugh hum sing dance sail soar
  today tonight evening noon midnight weekend season summer autumn winter april june july sunday
  azure indigo violet lilac coral peach apricot ivory pearl jade emerald copper bronze crimson scarlet teal marble
  glass crystal opal ruby
  bridge path trail road lane gate bench kite boat canoe raft anchor lighthouse compass map journey voyage island
  village market bakery cafe fountain vineyard tower temple pier dock windmill
  button ribbon thread bead acorn pinecone berry plum pear apple lemon melon cherry fig olive almond walnut
  honeycomb bubble sparkle twinkle shimmer glimmer flicker
`
      .split(/\s+/)
      .filter(Boolean)
  )
);

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
function shuffled<T>(a: T[]) {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

const decks = new Map<string, string[]>();
export function drawLines(world: World, n: number): string[] {
  let deck = decks.get(world.id) ?? [];
  const out: string[] = [];
  while (out.length < n) {
    if (!deck.length) deck = shuffled(world.prompts).filter(l => !out.includes(l));
    out.push(deck.pop()!);
  }
  decks.set(world.id, deck);
  return out;
}

export const trackText = (world: World, settings: PlaySettings = DEFAULT_PLAY_SETTINGS) => {
  const count = settings.linesPerTrack || LINES_PER_TRACK;
  const rawLines = drawLines(world, count);
  return formatTrackLines(rawLines, settings);
};

export const legacyTrackText = (world: World) => world.prompts.slice(0, 3).join(' ');

let zenCounter = 0;
export function zenChunk(world: World, settings: PlaySettings = DEFAULT_PLAY_SETTINGS): string {
  zenCounter++;
  if (Math.random() < 0.55) {
    return applyPlaySettingsToLine(drawLines(world, 1)[0], settings, zenCounter);
  }
  const n = 5 + Math.floor(Math.random() * 4);
  const out: string[] = [];
  while (out.length < n) {
    const w = pick(ZEN_WORDS);
    if (w !== out[out.length - 1]) out.push(w);
  }
  return applyPlaySettingsToLine(out.join(' '), settings, zenCounter);
}

export const OUTFITS = [
  { id: 'blue', name: 'Sky Hoodie', color: '#3b6dff', accent: '#ffffff', lvl: 0 },
  { id: 'orange', name: 'Sunny Tee', color: '#ff9a2e', accent: '#fff3d1', lvl: 1 },
  { id: 'mint', name: 'Mint Jacket', color: '#10b981', accent: '#d1fae5', lvl: 2 },
  { id: 'crimson', name: 'Ember Coat', color: '#ef4444', accent: '#fde047', lvl: 3 },
  { id: 'purple', name: 'Royal Robe', color: '#8b5cf6', accent: '#f3e8ff', lvl: 4 },
  { id: 'black', name: 'Midnight Suit', color: '#1e293b', accent: '#38bdf8', lvl: 6 },
  { id: 'gold', name: 'Celestial Armor', color: '#f59e0b', accent: '#fef08a', lvl: 8 },
];

export const HATS = [
  { id: 'hair', name: 'Windy Hair', lvl: 0 },
  { id: 'cap', name: 'Runner Cap', lvl: 1 },
  { id: 'visor', name: 'Cyber Visor', lvl: 2 },
  { id: 'beanie', name: 'Cozy Beanie', lvl: 3 },
  { id: 'crown', name: 'Starlight Crown', lvl: 5 },
  { id: 'halo', name: 'Astral Halo', lvl: 7 },
];

export const TRAILS = [
  { id: 'sparkle', name: 'Starlight', lvl: 0 },
  { id: 'bubble', name: 'Pearl Bubbles', lvl: 2 },
  { id: 'fire', name: 'Solar Flare', lvl: 3 },
  { id: 'aurora', name: 'Jade Aurora', lvl: 4 },
  { id: 'rainbow', name: 'Prism Ribbon', lvl: 5 },
];

export interface Look {
  outfit: string;
  hat: string;
  trail: string;
}

export interface Ghost {
  times: number[];
  wpm: number;
  text?: string;
}

export interface Stats {
  bestWpm: number;
  lastWpm: number;
  bestAcc: number;
  highestCombo: number;
  totalWords: number;
  tracks: number;
  unlocked: number;
  look: Look;
  ghosts: Record<string, Ghost>;
  settings: PlaySettings;
}

export function defaultStats(): Stats {
  return {
    bestWpm: 0,
    lastWpm: 0,
    bestAcc: 0,
    highestCombo: 0,
    totalWords: 0,
    tracks: 0,
    unlocked: 1,
    look: { outfit: 'blue', hat: 'hair', trail: 'sparkle' },
    ghosts: {},
    settings: { ...DEFAULT_PLAY_SETTINGS, enabledPunctuation: [...DEFAULT_PLAY_SETTINGS.enabledPunctuation] },
  };
}

export function loadStats(): Stats {
  const def = defaultStats();
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const isCoarse =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse)').matches;
    const savedMode = raw.settings?.deviceMode;
    const validMode =
      savedMode === 'desktop' || savedMode === 'mobile-native' || savedMode === 'touch-virtual'
        ? savedMode
        : isCoarse
          ? 'mobile-native'
          : 'desktop';
    return {
      ...def,
      ...raw,
      look: { ...def.look, ...(raw.look || {}) },
      ghosts: raw.ghosts || {},
      settings: {
        ...def.settings,
        ...(raw.settings || {}),
        deviceMode: validMode,
        deviceSelected: Boolean(raw.settings?.deviceSelected),
        autoShiftVirtual:
          typeof raw.settings?.autoShiftVirtual === 'boolean'
            ? raw.settings.autoShiftVirtual
            : true,
        enabledPunctuation: Array.isArray(raw.settings?.enabledPunctuation)
          ? raw.settings.enabledPunctuation
          : [...def.settings.enabledPunctuation],
      },
    };
  } catch {
    return def;
  }
}

export function saveStats(s: Stats) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // ignore storage quota errors
  }
}

export const level = (s: Stats) => s.tracks;
export { type PlaySettings, DEFAULT_PLAY_SETTINGS } from './utils/gameLogic';
