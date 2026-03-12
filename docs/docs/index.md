# pixi-live2d5

This repository is the `omniwaifu/pixi-live2d5` fork of the original `pixi-live2d-display` project.
It keeps the high-level Pixi integration API, but narrows support to the path this repository actively builds,
types, and tests: Cubism 5 on PixiJS 8.

## What This Fork Supports

- Cubism 5 Live2D models on PixiJS 8
- The root entrypoint and `pixi-live2d5/cubism5`
- Browser smoke testing through the included Mao model fixture
- Experimental loading from uploaded files and zip files

## What Changed From Upstream

- Legacy `cubism2` and `cubism4` subpaths are out of scope here
- The docs and CI in this fork track the `omniwaifu/pixi-live2d5` repository
- Bun is the primary package manager for local development and CI

## Next Pages

- Start with [Models](models.md) for model creation and loading behavior
- See [Interactions](interactions.md) for focus, hit-testing, and tap events
- See [Motions and Expressions](motions_expressions.md) for motion priorities and expressions
- See [Additional Features](additional.md) for hit-area overlays and experimental loaders
- See [Configs](configs.md) for runtime configuration hooks
- See [API Documentation](api_index.md) for generated API entry points
