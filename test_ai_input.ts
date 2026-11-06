// @vitest-environment node
import { it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Game } from './src/engine/game';
import Board from './src/components/GameBoard';
it('does not expose manual placement targets while a local robot owns the turn', () => {
  const g = new Game([{ name: 'Robot', isAI: true, color: 'red', meepleImg: '', avatarImg: '' }, { name: 'Human', isAI: false, color: 'blue', meepleImg: '', avatarImg: '' }]); g.start();
  const html = renderToStaticMarkup(React.createElement(Board, { game: g, onPlaceMeeple: () => { }, onSkipMeeple: () => { } }));
  expect(html).not.toContain('class="placeholder"');
  expect(html).not.toContain('slot-placeholder');
});

import Setup from './src/components/GameSetup';
import { GAME_AI_OPTIONS } from './src/engine/ai/config';
it('uses the hard production policy without a difficulty control', () => {
  expect(GAME_AI_OPTIONS.difficulty).toBe('hard');
  const html = renderToStaticMarkup(React.createElement(Setup, {onStart:()=>{},onBack:()=>{}}));
  expect(html).not.toContain('<select');
  expect(html).not.toContain('AI difficulty');
});
