const AVATAR_DESIGNS = [
  '1-nemo',
  '2-shelly',
  '3-sunny',
  '4-ray',
  '5-ollie',
  '6-moby',
  '7-pinchy',
  '8-skippy',
  '9-twinkle',
  '10-nori',
] as const;

const COLOR_KEYS = ['red', 'yellow', 'green', 'blue'] as const;
const ANIMAL_NICKNAMES: Record<string, string> = {
  nemo: 'Nemo',
  shelly: 'Shelly',
  sunny: 'Sunny',
  ray: 'Ray',
  ollie: 'Ollie',
  moby: 'Moby',
  pinchy: 'Pinchy',
  skippy: 'Skippy',
  twinkle: 'Twinkle',
  nori: 'Nori',
};

// Per-PNG visible diameter measured at alpha >= 128; normalize each 256px icon to the same medallion size.
const AVATAR_VISIBLE_DIAMETERS: Record<string, number> = {
  '1-nemo-blue.png': 233, '1-nemo-green.png': 234, '1-nemo-red.png': 235, '1-nemo-yellow.png': 232,
  '2-shelly-blue.png': 209, '2-shelly-green.png': 212, '2-shelly-red.png': 221, '2-shelly-yellow.png': 208,
  '3-sunny-blue.png': 220, '3-sunny-green.png': 206, '3-sunny-red.png': 228, '3-sunny-yellow.png': 214,
  '4-ray-blue.png': 211, '4-ray-green.png': 219, '4-ray-red.png': 220, '4-ray-yellow.png': 223,
  '5-ollie-blue.png': 221, '5-ollie-green.png': 204, '5-ollie-red.png': 221, '5-ollie-yellow.png': 231,
  '6-moby-blue.png': 215, '6-moby-green.png': 218, '6-moby-red.png': 222, '6-moby-yellow.png': 219,
  '7-pinchy-blue.png': 208, '7-pinchy-green.png': 215, '7-pinchy-red.png': 206, '7-pinchy-yellow.png': 217,
  '8-skippy-blue.png': 217, '8-skippy-green.png': 219, '8-skippy-red.png': 217, '8-skippy-yellow.png': 224,
  '9-twinkle-blue.png': 222, '9-twinkle-green.png': 220, '9-twinkle-red.png': 208, '9-twinkle-yellow.png': 216,
  '10-nori-blue.png': 216, '10-nori-green.png': 219, '10-nori-red.png': 225, '10-nori-yellow.png': 217,
};

export type PlayerColorKey = typeof COLOR_KEYS[number];

export function getPlayerAvatarScale(avatarImg?: string): number {
  const fileName = avatarImg?.split('?')[0].split('/').pop() ?? '';
  const visibleDiameter = AVATAR_VISIBLE_DIAMETERS[fileName] ?? 256;
  return (256 / visibleDiameter) * 100;
}

export function getAnimalIdFromAvatar(avatarImg?: string): string | null {
  return avatarImg?.match(/\/workers\/(\d+-[a-z]+)-(?:red|yellow|green|blue)\.png(?:\?v=[\w.-]+)?$/)?.[1] ?? null;
}

export function getAnimalNicknameFromAvatar(avatarImg?: string): string {
  const animalId = getAnimalIdFromAvatar(avatarImg);
  const animalName = animalId?.split('-')[1] ?? 'nemo';
  return ANIMAL_NICKNAMES[animalName] ?? 'Nemo';
}

function normalizeColorKey(colorKey?: string): PlayerColorKey {
  return COLOR_KEYS.includes(colorKey as PlayerColorKey) ? colorKey as PlayerColorKey : 'red';
}

export function getRandomPlayerAvatar(colorKey?: string, excludedAnimalIds: string[] = []): string {
  const availableAnimals = AVATAR_DESIGNS.filter(animal => !excludedAnimalIds.includes(animal));
  const animalPool = availableAnimals.length > 0 ? availableAnimals : AVATAR_DESIGNS;
  const animal = animalPool[Math.floor(Math.random() * animalPool.length)];
  return `/workers/${animal}-${normalizeColorKey(colorKey)}.png?v=1.0.4`;
}

export function getRandomUniquePlayerAvatars(colorKeys: string[]): string[] {
  const shuffledAnimals = [...AVATAR_DESIGNS];
  for (let index = shuffledAnimals.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffledAnimals[index], shuffledAnimals[swapIndex]] = [shuffledAnimals[swapIndex], shuffledAnimals[index]];
  }
  return colorKeys.map((colorKey, index) => `/workers/${shuffledAnimals[index % shuffledAnimals.length]}-${normalizeColorKey(colorKey)}.png?v=1.0.4`);
}

export function getPlayerAvatarForColor(
  avatarImg: string | undefined,
  colorKey: string,
  excludedAnimalIds: string[] = []
): string {
  const animalId = getAnimalIdFromAvatar(avatarImg);
  if (animalId && !excludedAnimalIds.includes(animalId)) {
    return `/workers/${animalId}-${normalizeColorKey(colorKey)}.png?v=1.0.4`;
  }
  return getRandomPlayerAvatar(colorKey, excludedAnimalIds);
}

/** Stable fallback for older online room presences that do not include an avatar yet. */
export function getPlayerAvatarForUser(userId: string, colorKey?: string): string {
  let hash = 0;
  for (let index = 0; index < userId.length; index += 1) {
    hash = (hash * 31 + userId.charCodeAt(index)) >>> 0;
  }
  const animal = AVATAR_DESIGNS[hash % AVATAR_DESIGNS.length];
  return `/workers/${animal}-${normalizeColorKey(colorKey)}.png?v=1.0.4`;
}
