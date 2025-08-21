# pixi-live2d-display

![GitHub package.json version](https://img.shields.io/github/package-json/v/guansss/pixi-live2d-display?style=flat-square)
![Cubism version](https://img.shields.io/badge/Cubism-5-ff69b4?style=flat-square)
![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/guansss/pixi-live2d-display/test.yml?style=flat-square)

English | [中文](README.zh.md)

Live2D integration for [PixiJS](https://github.com/pixijs/pixi.js) v6.

This project aims to be a universal Live2D framework on the web platform. While the official Live2D framework is just
complex and problematic, this project has rewritten it to unify and simplify the APIs, which allows you to control the
Live2D models on a high level without the need to learn how the internal system works.

#### Features

- Supports Cubism 5 Live2D models
- Supports PIXI.RenderTexture and PIXI.Filter
- Pixi-style transform APIs: position, scale, rotation, skew, anchor
- Automatic interactions: focusing, hit-testing
- Enhanced motion reserving logic compared to the official framework
- Loading from uploaded files / zip files (experimental)
- Fully typed - we all love types!

#### Requirements

- PixiJS: 6.x
- Cubism core: 5
- Browser: WebGL, ES6

#### Documentations

- [Documentation](https://guansss.github.io/pixi-live2d-display)
- [API Documentation](https://guansss.github.io/pixi-live2d-display/api/index.html)
- [Development Notes](DEVELOPMENT.md)

## Cubism

Cubism is the name of Live2D SDK. This plugin supports Cubism 5 models.

#### Cubism Core

Before using the plugin, you'll need to include the Cubism runtime library, aka Cubism Core.

For Cubism 5, you need `live2dcubismcore.min.js` that can be extracted from
the [Cubism 5 SDK](https://www.live2d.com/download/cubism-sdk/download-web/).

#### Bundle

The plugin provides `cubism5.js` for Cubism 5 runtime support. Use `cubism5.js`+`live2dcubismcore.min.js` to support Cubism 5 models.

## Installation

#### Via npm

```sh
npm install pixi-live2d-display
```

```js
import { Live2DModel } from 'pixi-live2d-display';

// for Cubism 5
import { Live2DModel } from 'pixi-live2d-display/cubism5';
```

#### Via CDN

```html
<!-- for Cubism 5 -->
<script src="https://cdn.jsdelivr.net/npm/pixi-live2d-display/dist/cubism5.min.js"></script>
```

In this way, all the exported members are available under `PIXI.live2d` namespace, such as `PIXI.live2d.Live2DModel`.

## Basic usage

```javascript
import * as PIXI from 'pixi.js';
import { Live2DModel } from 'pixi-live2d-display';

// expose PIXI to window so that this plugin is able to
// reference window.PIXI.Ticker to automatically update Live2D models
window.PIXI = PIXI;

(async function () {
  const app = new PIXI.Application({
    view: document.getElementById('canvas'),
  });

  const model = await Live2DModel.from('mao.model3.json');

  app.stage.addChild(model);

  // transforms
  model.x = 100;
  model.y = 100;
  model.rotation = Math.PI;
  model.skew.x = Math.PI;
  model.scale.set(2, 2);
  model.anchor.set(0.5, 0.5);

  // interaction
  model.on('hit', (hitAreas) => {
    if (hitAreas.includes('body')) {
      model.motion('tap_body');
    }
  });
})();
```

## Package importing

When importing Pixi packages on-demand, you may need to manually register some plugins to enable optional features.

```javascript
import { Application } from '@pixi/app';
import { Ticker, TickerPlugin } from '@pixi/ticker';
import { InteractionManager } from '@pixi/interaction';
import { Live2DModel } from 'pixi-live2d-display';

// register Ticker for Live2DModel
Live2DModel.registerTicker(Ticker);

// register Ticker for Application
Application.registerPlugin(TickerPlugin);

// register InteractionManager to make Live2D models interactive
Renderer.registerPlugin('interaction', InteractionManager);

(async function () {
  const app = new Application({
    view: document.getElementById('canvas'),
  });

  const model = await Live2DModel.from('mao.model3.json');

  app.stage.addChild(model);
})();
```

---

The example Live2D model, Mao (Cubism 5), is redistributed under
Live2D's [Free Material License](https://www.live2d.com/eula/live2d-free-material-license-agreement_en.html).
