# METAMORPH

One game, seven forms. Each form is rebuilt from the pieces of the last:

| Form | Built from the previous form |
|---|---|
| Tic-Tac-Toe | Title logo particles fly into the grid lines (on later loops, Pong's paddles and net rotate into them) |
| Connect Four | The 4 grid lines unfold into the lattice; X/O pieces melt into discs and drop under gravity |
| Snake | The winning four-in-a-row becomes the snake; your other discs become food, the AI's become mines |
| Asteroids | Snake head → ship, body segments → rocks, the grid's dots lift off as the starfield |
| Galaga | Rocks crack; shards fly into formation and materialise pixel-by-pixel as aliens; stars warp into a scroll |
| Breakout | Surviving aliens dissolve; their pixels rebuild as the brick wall. Ship flattens into the paddle; its last bullet becomes the ball |
| Pong | The ball never stops: the last brick's debris assembles the CPU paddle mid-rally |

Then it loops, faster and smarter, with an extra life per loop.

## Run / deploy

- Served by the user unit `metamorph.service` (`host/serve.py`, `127.0.0.1:8089`, `Cache-Control: no-store`).
- Tailnet: `sudo tailscale serve --bg --https=9444 http://127.0.0.1:8089` (tailnet-only, port :9444).
- After editing files: `bash host/stamp.sh` (bumps the build id in `index.html` + `sw.js` so installed copies update), then `bash host/probe.sh` (exit 0 = live matches disk).
- First-time setup / repair: `bash host/install.sh`.

## Layout

- `js/main.js` loop, game state, lives/score, menus · `js/gfx.js` WebGL post (bloom, shockwaves, aberration, nebula)
- `js/audio.js` synth + per-form music + in-key SFX · `js/input.js` touch/keys/haptics · `js/fx.js` particles, stars, shake · `js/hud.js`
- `js/stages/*.js` one file per form; each constructor receives the previous stage and morphs its pieces.

## Debug

- `?stage=N` start at form N (0–6) · `?debug` enables `N` key = force-complete the current form · `?ts=0.25` slow time.
- `tools/` holds a no-dependency Chrome DevTools driver (`cdp.mjs`) and test scripts (`chain.mjs`, `deaths.mjs`, `fuzz.mjs`, `trans.mjs`). They expect headless Chrome on `:9333` and a static server on `:8765`.
