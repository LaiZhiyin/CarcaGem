import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { getTileSize } from './src/utils/device';
import { getRandomUniquePlayerAvatars, getAnimalIdFromAvatar, getPlayerAvatarForColor } from './src/utils/playerAvatars';
const originalWidth = window.innerWidth;
const originalHeight = window.innerHeight;
afterEach(() => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalHeight });
});
describe('review regressions', () => {
  it.each([[390, 844, 60], [844, 390, 60], [768, 1024, 110], [1280, 720, 70], [1920, 1080, 110]])('sizes tiles from live viewport %sx%s', (width, height, expected) => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
    expect(getTileSize()).toBe(expected);
  });
  it('keeps player animals unique and preserves them when changing color', () => {
    const avatars = getRandomUniquePlayerAvatars(['red', 'blue', 'green']);
    expect(new Set(avatars.map(getAnimalIdFromAvatar)).size).toBe(3);
    for (const avatar of avatars) {
      expect(existsSync(`public${avatar.split('?')[0]}`)).toBe(true);
      expect(getAnimalIdFromAvatar(getPlayerAvatarForColor(avatar, 'yellow'))).toBe(getAnimalIdFromAvatar(avatar));
    }
  });
  it('ships the guide targeted by the home link', () => {
    const guide = readFileSync('public/player-guide.html', 'utf8');
    expect(guide).toContain('<html lang="en">');
    expect(guide).toContain('Player Guide');
  });
});
