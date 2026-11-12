import { STORAGE_KEY } from './config';

export interface World {
  id: string; name: string; sky: [string, string]; fog: string; block: string; island: string; grass: string;
  particles: 'petals' | 'snow' | 'stars' | 'none'; gravity: number; prompts: string[];
}

/** How many lines are drawn for one Journey / Ghost track. */
export const LINES_PER_TRACK = 3;

/** One line per row. Lowercase letters and spaces only: that is all the on-screen keyboard offers. */
const lines = (block: string) => block.split('\n').map(l => l.trim()).filter(Boolean);

// The first three lines of each world must stay exactly as they are: ghosts saved before
// tracks were shuffled were recorded on those three lines (see legacyTrackText).
export const WORLDS: World[] = [
  { id: 'sky', name: 'Sky Gardens', sky: ['#9fd4ff', '#ffd6ec'], fog: '#cfe6ff', block: '#5b8cff', island: '#c9a27a', grass: '#8fdc8a', particles: 'petals', gravity: 1,
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
    `) },
  { id: 'neon', name: 'Neon Grid', sky: ['#2a0845', '#ff4fa3'], fog: '#4a1260', block: '#ff3df2', island: '#341a5e', grass: '#00f0ff', particles: 'stars', gravity: 1,
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
    `) },
  { id: 'ice', name: 'Icy Peaks', sky: ['#dff3ff', '#8fb8de'], fog: '#e8f6ff', block: '#7fd3ff', island: '#e9f4fb', grass: '#ffffff', particles: 'snow', gravity: 1,
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
    `) },
  { id: 'cosmic', name: 'Cosmic Void', sky: ['#05031a', '#2b1b5c'], fog: '#120a33', block: '#9b7bff', island: '#3b2f6b', grass: '#ffd36e', particles: 'stars', gravity: 0.55,
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
    `) },
];

export const ZEN_WORDS = Array.from(new Set(`
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
`.split(/\s+/).filter(Boolean)));

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
function shuffled<T>(a: T[]) {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}

const decks = new Map<string, string[]>();
/** Deal `n` lines from a world's shuffled deck, so nothing repeats until every line has come up. */
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

/** Text for a fresh Journey / Ghost track. */
export const trackText = (world: World) => drawLines(world, LINES_PER_TRACK).join(' ');
/** Text that ghosts saved without their own text were recorded on. */
export const legacyTrackText = (world: World) => world.prompts.slice(0, 3).join(' ');

/** Next stretch of Zen mode: one of the world's lines, or a handful of loose words. */
export function zenChunk(world: World): string {
  if (Math.random() < 0.5) return drawLines(world, 1)[0];
  const n = 4 + Math.floor(Math.random() * 4);
  const out: string[] = [];
  while (out.length < n) { const w = pick(ZEN_WORDS); if (w !== out[out.length - 1]) out.push(w); }
  return out.join(' ');
}

export const OUTFITS = [
  { id: 'blue', name: 'Sky Hoodie', color: '#3b6dff', lvl: 0 },
  { id: 'orange', name: 'Sunny Tee', color: '#ff9a2e', lvl: 1 },
  { id: 'mint', name: 'Mint Jacket', color: '#3fd6a0', lvl: 2 },
  { id: 'purple', name: 'Royal Robe', color: '#9b5bff', lvl: 4 },
  { id: 'black', name: 'Midnight Suit', color: '#2a2a3a', lvl: 6 },
];
export const HATS = [
  { id: 'hair', name: 'Messy Hair', lvl: 0 },
  { id: 'cap', name: 'Ball Cap', lvl: 1 },
  { id: 'beanie', name: 'Beanie', lvl: 3 },
  { id: 'crown', name: 'Crown', lvl: 5 },
];
export const TRAILS = [
  { id: 'sparkle', name: 'Sparkles', lvl: 0 },
  { id: 'bubble', name: 'Bubbles', lvl: 2 },
  { id: 'fire', name: 'Fire', lvl: 3 },
  { id: 'rainbow', name: 'Rainbow', lvl: 5 },
];
export interface Look { outfit: string; hat: string; trail: string }

/** A personal-best run: when each letter landed (ms), and the text it was typed on. */
export interface Ghost { times: number[]; wpm: number; text?: string }

export interface Stats {
  bestWpm: number; lastWpm: number; bestAcc: number; highestCombo: number; totalWords: number; tracks: number;
  unlocked: number; look: Look; ghosts: Record<string, Ghost>;
}

export function loadStats(): Stats {
  const def: Stats = { bestWpm: 0, lastWpm: 0, bestAcc: 0, highestCombo: 0, totalWords: 0, tracks: 0, unlocked: 1, look: { outfit: 'blue', hat: 'hair', trail: 'sparkle' }, ghosts: {} };
  try { return { ...def, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') }; } catch { return def; }
}
export function saveStats(s: Stats) { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }
export const level = (s: Stats) => s.tracks;
