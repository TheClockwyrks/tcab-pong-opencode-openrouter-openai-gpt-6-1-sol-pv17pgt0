# Carom

A browser paddle duel about angles, movement, and a well-timed return. Slide into a shot to give the ball spin, bend its flight, and bank it off two swaying, rotating obstacles. Play against the computer in **Solo**, or share a keyboard in **Versus**. First to 11, with a two-point lead, wins.

Everything is drawn on canvas and every sound is synthesized in code. The game runs entirely locally, with no accounts, services, or runtime asset downloads.

## Run

Requires Node.js 22.12+ and npm.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite.

## Production

```sh
npm ci
npm run build
```

Serve the resulting `dist/` directory from the root of any static host. To try the production build locally, run `npm run preview`.

## Controls

| Action | Keys |
| --- | --- |
| Solo paddle | **W / S** or **↑ / ↓** |
| Versus left paddle | **W / S** |
| Versus right paddle | **↑ / ↓** |
| Select menu item | **W / S** or **↑ / ↓**, mouse, or touch |
| Confirm | **Enter / Space**, click, or tap |
| Pause / resume | **P / Escape** |
| Back | **Escape** |
| Mute / unmute | **M** |
| Diagnostics | **Backtick** |

Touch devices get two vertical paddle controls and menu buttons from the engine. Move at the instant of contact to add spin; strike near a paddle's end to send the ball out at a steeper angle. The ball accelerates with every paddle hit. After each point, a one-second hold gives both players time to reposition.

## Development and verification

```sh
npm run typecheck
npm run lint
npm run format
npm test
```

The Vitest suite drives the real Simple 2D engine over an in-process canvas and controlled clocks. It checks physics, timing, scoring, menus, AI, immutable transitions, debug poses, sound events, and recording. Coverage and machine-readable results are written to `coverage/`.

### Source map

- `src/game.ts`: exported state and debug contracts; engine initialization and frame orchestration.
- `src/simulation.ts`: render-free movement, spin, collision, serving, and scoring.
- `src/menus.ts`: shared menu geometry and keyboard/pointer/touch navigation.
- `src/render.ts`: code-drawn court, interface, and trail.
- `src/debug.ts`: value-based scenario poses and detached snapshots, available through `engine.debug`.
- `showcase/`: player description, screenshots, and an engine draw-command replay.

The supplied engine documentation is in `engine/`; the full game contract is in `specs/`.
