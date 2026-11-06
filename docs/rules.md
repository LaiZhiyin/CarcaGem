# CarcaGem Game Rules

## Goal

Place landscape tiles, claim features with explorers, and finish with the highest total score. The game supports two or three players, including local AI seats and online rooms.

## A turn

1. Draw the next tile and place it in a legal position. Every touching edge must match: sea to sea, beach to beach, and road to road. Rotate the tile before confirming if needed.
2. Optionally place one available explorer on an unclaimed feature shown by a marker on the new tile. A connected road, beach, or sea that already contains an explorer cannot be claimed again. You may skip placement and keep the explorer.
3. Score any feature completed by the placement. Explorers on completed roads, beaches, and lighthouses return to their owners. Explorers at sea remain there until the end of the game.

## Features and scoring

- **Road:** A road is complete when all open ends connect. Each distinct tile scores 1 point, both when completed and when unfinished at game end.
- **Beach:** A beach is complete when all of its outward edges connect. Each tile scores 2 points when complete and 1 point when unfinished at game end.
- **Lighthouse:** A lighthouse is complete when all eight neighboring spaces, including the diagonals, contain a tile. A completed lighthouse scores 9 points. An unfinished lighthouse scores the number of surrounding tiles plus 1 at game end.
- **Sea:** Sea regions connect along tile edges and do not score immediately. At game end, each claimed connected sea scores 3 points for every different completed beach it touches. The same beach counts once even if the sea touches it at several points. Open beaches and lighthouses do not count.

When a feature scores, the player with the most explorers in it receives the full value. Every player tied for the most also receives the full value; points are not split.

## Treasure turns

Some tiles carry a red gem. When a completed road or beach contains a treasure tile and has at least one explorer, the player or players with the most explorers in that feature receive an extra turn. Drawing or placing a gem tile alone does not trigger the reward.

## End of the game

The game ends after the final tile is scored, or when no remaining tile can be placed legally. Unfinished roads, beaches, and lighthouses are scored, along with claimed seas. Add these points to the scores already earned; the highest total wins.

## Controls

- Press **R** to rotate the current tile.
- Press **Space** to skip explorer placement and confirm the tile.
- Press **Esc** to close the Remaining Tiles panel or cancel a selected placement.
- In local games, press **Ctrl/⌘ + Z** or select Undo to reverse a turn.
