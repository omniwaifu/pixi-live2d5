# pixi-live2d-display

![GitHub package.json version](https://img.shields.io/github/package-json/v/omniwaifu/pixi-live2d5?style=flat-square)
![Cubism version](https://img.shields.io/badge/Cubism-5-ff69b4?style=flat-square)
![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/omniwaifu/pixi-live2d5/test.yml?style=flat-square)

English | [中文](README.zh.md)

Live2D integration for [PixiJS](https://github.com/pixijs/pixi.js) v8.

This fork focuses on the Cubism 5 web runtime and PixiJS 8. It keeps the original high-level API, but narrows the
supported surface down to the production path this repo actually builds, types, and tests.

#### Features

-   Supports Cubism 5 Live2D models
-   Best-effort compatibility for older `.moc3` / `.model3.json` models that still load through the Cubism 5 SDK
-   Supports PIXI.RenderTexture and PIXI.Filter
-   Pixi-style transform APIs: position, scale, rotation, skew, anchor
-   Automatic interactions: focusing, hit-testing
-   Enhanced motion reserving logic compared to the official framework
-   Loading from uploaded files / zip files (experimental)
-   Fully typed - we all love types!

#### Requirements

-   PixiJS: 8.x
-   Cubism core: 5
-   Browser: WebGL, ES6

#### Documentations

-   [Documentation](https://guansss.github.io/pixi-live2d-display)
-   [API Documentation](https://guansss.github.io/pixi-live2d-display/api/index.html)
-   [Development Notes](DEVELOPMENT.md)

## Cubism

Cubism is the name of Live2D SDK. This fork ships a Cubism 5 integration only.

#### Cubism Core

Before using the plugin, you'll need to include the Cubism runtime library, aka Cubism Core.

For Cubism 5, you need `live2dcubismcore.min.js` or `live2dcubismcore.js` from
the [Cubism 5 SDK](https://www.live2d.com/download/cubism-sdk/download-web/).

#### Bundle

The package exposes the root entrypoint and `pixi-live2d-display/cubism5`. Legacy `cubism2` / `cubism4` subpaths are
not part of this fork.

## Installation

#### Via GitHub (this fork)

```sh
npm install github:omniwaifu/pixi-live2d5
```

Or with specific commit/tag:

```sh
npm install github:omniwaifu/pixi-live2d5#master
```

```js
import { Live2DModel } from "pixi-live2d-display";

// explicit Cubism 5 entrypoint kept for compatibility
import { Live2DModel } from "pixi-live2d-display/cubism5";
```

#### Local Development

```sh
git clone https://github.com/omniwaifu/pixi-live2d5.git
cd pixi-live2d5
npm install
npm run setup
npm run build
```

`npm run setup` downloads the Cubism 5 core files used by the playground and browser smoke tests.

Then link it to your project:

```sh
npm link
# In your project directory:
npm link pixi-live2d-display
```

## Basic usage

```javascript
import * as PIXI from "pixi.js";
import { Live2DModel } from "pixi-live2d-display";

// expose PIXI to window so that this plugin is able to
// reference window.PIXI.Ticker to automatically update Live2D models
window.PIXI = PIXI;

(async function () {
    const app = new PIXI.Application();

    await app.init({
        canvas: document.getElementById("canvas"),
        resizeTo: window,
    });

    const model = await Live2DModel.from("mao.model3.json");

    app.stage.addChild(model);

    // transforms
    model.x = 100;
    model.y = 100;
    model.rotation = Math.PI;
    model.skew.x = Math.PI;
    model.scale.set(2, 2);
    model.anchor.set(0.5, 0.5);

    // interaction
    model.on("hit", (hitAreas) => {
        if (hitAreas.includes("body")) {
            model.motion("tap_body");
        }
    });
})();
```

`Live2DModel.from()` expects a Cubism 5-compatible `model3.json` model. Older Cubism 3/4-era `.moc3` models may still
work if the Cubism 5 SDK accepts them, but Cubism 2 `.model.json` / `.moc` assets are not supported by this fork.

## Package importing

When importing Pixi packages on-demand, you may need to manually register the Ticker to enable automatic Live2D model updates.

```javascript
import { Application } from "pixi.js";
import { Ticker } from "pixi.js";
import { Live2DModel } from "pixi-live2d-display";

// register Ticker for Live2DModel
Live2DModel.registerTicker(Ticker);

(async function () {
    const app = new Application();

    await app.init({
        canvas: document.getElementById("canvas"),
        resizeTo: window,
    });

    const model = await Live2DModel.from("mao.model3.json");

    app.stage.addChild(model);
})();
```

---

The example Live2D model, Mao (Cubism 5), is redistributed under
Live2D's [Free Material License](https://www.live2d.com/eula/live2d-free-material-license-agreement_en.html).
