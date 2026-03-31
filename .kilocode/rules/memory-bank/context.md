# Active Context: Squirrel Singularity Game

## Current State

**Project Status**: Squirrel Singularity - Canvas-based gravity/entanglement game

A Next.js 16 game where players use a gravity well to pull squirrels together, entangle their tails, and create black holes.

## Recently Completed

- [x] Base Next.js 16 setup with App Router, TypeScript, Tailwind CSS 4
- [x] Squirrel Singularity game with canvas rendering
- [x] 2-body squirrel system: emoji body + 6-segment tail chain with Verlet physics
- [x] Tail entanglement system: tails from different squirrels link when within 18px
- [x] Union-find algorithm to track connected groups of entangled squirrels
- [x] Collapse animation when 25 squirrels are entangled (spiral toward center)
- [x] Black hole creation from collapsed squirrels with accretion disk, photon ring, event horizon
- [x] Periodic squirrel pair emission from black hole surface (one falls in, one escapes)
- [x] Gravity well attraction without absorption (well pulls but doesn't destroy)
- [x] Level progression system with difficulty scaling
- [x] Flee mechanic for level 2+ squirrels
- [x] Splash title screen with cosmic/space theme, animated orbiting squirrels, skippable click-to-start
- [x] Achievement toast notifications for 11 milestones (black holes, levels, squirrels caught, combos)

## Game Mechanics

| Mechanic | Description |
|----------|-------------|
| Gravity Well | Hold to attract squirrels (purple pulse visual) |
| Tail Physics | 6-segment chain per squirrel, Verlet integration + spring constraints |
| Entanglement | Tail segments within 18px form permanent links between squirrels |
| Union-Find | Tracks connected groups; 25+ entangled triggers collapse |
| Collapse | Spiral animation toward center of mass → black hole forms |
| Black Hole | Accretion disk, photon ring, Hawking radiation, event horizon |
| Emission | Every ~3.3s, black hole spawns pair: one escapes, one falls in |
| Level Up | Click black hole to advance (fade transition, increased difficulty) |

## Current Structure

| File/Directory | Purpose | Status |
|----------------|---------|--------|
| `src/components/BlackHoleGame.tsx` | Entire game (single canvas component) | ✅ Active |
| `src/components/SplashScreen.tsx` | Animated title screen overlay with orbiting squirrels | ✅ Active |
| `src/app/page.tsx` | Manages splash→game transition, renders both components | ✅ Ready |
| `src/app/layout.tsx` | Root layout with Geist fonts | ✅ Ready |
| `src/app/globals.css` | Tailwind import | ✅ Ready |

## Tech Stack

- Next.js 16, React 19, TypeScript, Tailwind CSS 4
- HTML5 Canvas 2D for all game rendering
- Bun as package manager
- No game libraries - all physics/rendering hand-coded

## Session History

| Date | Changes |
|------|---------|
| Initial | Template created with base setup |
| 2026-03-30 | Complete game rewrite: 2-body squirrel system, tail entanglement, collapse-to-blackhole mechanic, squirrel pair emission from black hole |
| 2026-03-31 | Added splash title screen with cosmic theme, orbiting squirrels, click-to-start transition |
| 2026-03-31 | Added achievement toast notification system: 11 milestones tracked, persisted in localStorage, slide-in toasts auto-dismiss after 3s |
