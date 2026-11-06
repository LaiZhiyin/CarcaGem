// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HUD from './src/components/HUD';
import { Game } from './src/engine/game';
import { TILES } from './src/data/tiles';
import { isValidPlacement } from './src/engine/validator';

const players = [
  { userId: 'a', name: 'A', color: '#e74c3c', isAI: false, meepleImg: '/workers/take-point-red.png', avatarImg: '' },
  { userId: 'b', name: 'B', color: '#3498db', isAI: false, meepleImg: '/workers/take-point-blue.png', avatarImg: '' },
];
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function render(game: Game) {
  act(() => root.render(createElement(HUD, {
    game, onSkipMeeple: () => {}, onUndo: () => {}, onNewGame: () => {}, onReload: () => {},
    showGameModal: () => {}, hideModal: () => {},
  })));
}

function click(title: string) {
  const button = container.querySelector<HTMLButtonElement>(`button[title="${title}"]`);
  expect(button).not.toBeNull();
  act(() => { button!.focus(); button!.click(); });
}

function inventory() {
  return [...container.querySelectorAll('.remaining-tile-count')].map(element => Number(element.textContent));
}

describe('remaining tile inventory', () => {
  it.each([false, true])('shows all 25 types in toolbar order for online=%s', online => {
    const game = new Game(players, 17526);
    game.isOnline = online;
    game.start();
    render(game);
    const titles = [...container.querySelectorAll('.hud-bottom-bar button')].map(button => button.getAttribute('title'));
    expect(titles).toEqual(online
      ? ['Return to home', 'Latest Activity', 'Remaining Tiles', 'Fullscreen']
      : ['Return to home', 'Latest Activity', 'Remaining Tiles', 'Undo Last Turn', 'Fullscreen']);
    click('Remaining Tiles');
    expect(container.querySelector('#remaining-tiles-title')?.textContent).toBe(`Remaining Tiles ${game.deck.length}/80`);
    expect(container.querySelectorAll('.remaining-tile')).toHaveLength(25);
    expect([...container.querySelectorAll('.remaining-tile img')].map(image => image.getAttribute('src'))).toEqual(TILES.map(tile => tile.image));
    expect(inventory().reduce((sum, count) => sum + count, 0)).toBe(game.deck.length);
    expect(inventory()[3]).toBe(4); // The starter is already on the board.
    expect(inventory()[0]).toBe(2); // Seed 17526 has already drawn a type-1 tile.
  });

  it('updates an open panel after a turn and undo, and keeps exhausted types visible', () => {
    const game = new Game(players, 17526);
    game.isOnline = false;
    game.start();
    render(game);
    click('Remaining Tiles');
    const before = inventory();
    let placed = false;
    for (const slot of game.board.getAvailableSlots()) {
      for (const rotation of [0, 90, 180, 270]) {
        if (!isValidPlacement(game.board, slot.x, slot.y, game.currentTile!, rotation)) continue;
        game.currentRotation = rotation;
        game.tentativePlace(slot.x, slot.y);
        game.skipMeeple();
        placed = true;
        break;
      }
      if (placed) break;
    }
    expect(placed).toBe(true);
    render(game);
    expect(inventory().reduce((sum, count) => sum + count, 0)).toBe(before.reduce((sum, count) => sum + count, 0) - 1);
    game.undo();
    render(game);
    expect(inventory()).toEqual(before);
    game.deck = game.deck.filter(tile => tile.id !== 7);
    render(game);
    expect(inventory()).toHaveLength(25);
    expect(inventory()[6]).toBe(0);
    expect(container.querySelectorAll('.remaining-tile')[6].classList.contains('is-empty')).toBe(true);
  });

  it('switches between panels and closes with Escape without cancelling a pending tile', () => {
    const game = new Game(players, 17526);
    game.isOnline = false;
    game.start();
    game.currentRotation = 90;
    expect(game.tentativePlace(1, 0)).toBe(true);
    render(game);
    click('Latest Activity');
    click('Remaining Tiles');
    expect(container.querySelectorAll('.hud-messages-panel')).toHaveLength(1);
    const boardShortcut = vi.fn();
    window.addEventListener('keydown', boardShortcut);
    try {
      const close = container.querySelector<HTMLButtonElement>('.hud-remaining-tiles-panel .hmp-close')!;
      act(() => close.dispatchEvent(new KeyboardEvent('keydown', { key: 'F5', bubbles: true })));
      expect(boardShortcut).toHaveBeenCalledTimes(1); // The app must still intercept refresh.
      boardShortcut.mockClear();
      act(() => close.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })));
      expect(boardShortcut).not.toHaveBeenCalled();
      act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
      expect(container.querySelector('#remaining-tiles-panel')).toBeNull();
      expect(boardShortcut).not.toHaveBeenCalled();
      expect(game.state).toBe('ADJUST_TILE');
      expect(document.activeElement).toBe(container.querySelector('.hud-remaining-btn'));
    } finally { window.removeEventListener('keydown', boardShortcut); }
  });
});
