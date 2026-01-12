# simple-mini-game — Haunted Mansion Ghost Scare

A small browser platformer built with HTML, CSS, and JavaScript. The player is a ghost who walks through a haunted mansion to scare kids. Scare them up close to score; be careful—if a kid sees you first, you lose points. Ambient rain and thunder are produced with WebAudio.

Features:
- Canvas-based platformer physics (jump, sprint, momentum).
- Multiple horizontally-arranged levels (move to the edge to go to the next room).
- Simple AI for kids: they can see the player if you approach from their front.
- WebAudio ambient rain, occasional thunder, and short scream when scaring a child.
- Win condition: 10 scares.

Controls:
- Left / Right arrows — move
- Up arrow — jump
- Hold Shift — sprint
- Space — scare (must be close & not already seen)
- Toggle audio with the "Audio" checkbox in the HUD.

Deploy to GitHub Pages:
1. Place `index.html`, `styles.css`, and `script.js` at the repository root (or in `docs/` and change Pages settings).
2. Commit & push to the `main` branch.
3. In GitHub repository Settings → Pages, select the branch and folder (root or /docs), then Save.
4. Visit the published URL after build completes.

To customize:
- Edit `createLevels()` in `script.js` to change platforms, positions, or kids.
- Replace the primitive drawings with sprite images if you prefer art assets.
- Swap WebAudio code for external audio files by modifying `startAudio()` and effect functions.

Enjoy! If you want, I can:
- Add sprite art and a tileset for the mansion.
- Replace audio with downloadable WAV/OGG files.
- Add persistent high-score storage using localStorage.
