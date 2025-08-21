# pixi-live2d-display

![GitHub package.json version](https://img.shields.io/github/package-json/v/guansss/pixi-live2d-display?style=flat-square)
![Cubism version](https://img.shields.io/badge/Cubism-5-ff69b4?style=flat-square)
![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/guansss/pixi-live2d-display/test.yml?style=flat-square)

为 [PixiJS](https://github.com/pixijs/pixi.js) v6 提供的 Live2D 插件

此项目旨在成为 web 平台上的通用 Live2D 框架。由于 Live2D 的官方框架非常复杂且不可靠，这个项目已将其重写以提供统一且简单的 API，使你可以从较高的层次来控制 Live2D 模型而无需了解其内部的工作原理

#### 特性

-   支持 Cubism 5 Live2D 模型
-   支持 PIXI.RenderTexture 和 PIXI.Filter
-   Pixi 风格的变换 API：position, scale, rotation, skew, anchor
-   自动交互：鼠标跟踪, 点击命中检测
-   比官方框架更好的动作预约逻辑
-   从上传的文件或 zip 文件中加载 (实验性功能)
-   完善的类型定义 - 我们都喜欢类型！

#### 要求

-   PixiJS：6.x
-   Cubism core：5
-   浏览器：WebGL， ES6

#### 示例

-   [基础示例](https://codepen.io/guansss/pen/oNzoNoz/left?editors=1010)
-   [交互示例](https://codepen.io/guansss/pen/KKgXBOP/left?editors=0010)
-   [渲染纹理与滤镜示例](https://codepen.io/guansss/pen/qBaMNQV/left?editors=1010)
-   [Live2D Viewer Online](https://guansss.github.io/live2d-viewer-web/)

#### 文档

-   [文档](https://guansss.github.io/pixi-live2d-display)（暂无中文翻译）
-   [API 文档](https://guansss.github.io/pixi-live2d-display/api/index.html)

## Cubism

Cubism 是 Live2D SDK 的名称。该插件支持 Cubism 5 模型。

#### Cubism Core

在使用该插件之前，你需要加载 Cubism 运行时，也就是 Cubism Core

Cubism 5 需要加载 `live2dcubismcore.min.js`，可以从 [Cubism 5 SDK](https://www.live2d.com/download/cubism-sdk/download-web/) 里解压出来。

#### 打包文件

该插件提供 `cubism5.js` 用于 Cubism 5 运行时支持。使用 `cubism5.js`+`live2dcubismcore.min.js` 以支持 Cubism 5 模型。

## 安装

#### 通过 npm

```sh
npm install pixi-live2d-display
```

```js
import { Live2DModel } from 'pixi-live2d-display';

// 对于 Cubism 5
import { Live2DModel } from 'pixi-live2d-display/cubism5';
```

#### 通过 CDN

```html
<!-- 对于 Cubism 5 -->
<script src="https://cdn.jsdelivr.net/npm/pixi-live2d-display/dist/cubism5.min.js"></script>
```

通过这种方式加载的话，所有成员都会被导出到 `PIXI.live2d` 命名空间下，比如 `PIXI.live2d.Live2DModel`

## 基础使用

```javascript
import * as PIXI from 'pixi.js';
import { Live2DModel } from 'pixi-live2d-display';

// 将 PIXI 暴露到 window 上，这样插件就可以通过 window.PIXI.Ticker 来自动更新模型
window.PIXI = PIXI;

(async function () {
    const app = new PIXI.Application({
        view: document.getElementById('canvas'),
    });

    const model = await Live2DModel.from('mao.model3.json');

    app.stage.addChild(model);

    // 变换
    model.x = 100;
    model.y = 100;
    model.rotation = Math.PI;
    model.skew.x = Math.PI;
    model.scale.set(2, 2);
    model.anchor.set(0.5, 0.5);

    // 交互
    model.on('hit', (hitAreas) => {
        if (hitAreas.includes('body')) {
            model.motion('tap_body');
        }
    });
})();
```

## 包导入

当按需导入 Pixi 的包时，需要手动注册相应的组件来启用可选功能

```javascript
import { Application } from '@pixi/app';
import { Ticker } from '@pixi/ticker';
import { InteractionManager } from '@pixi/interaction';
import { Live2DModel } from 'pixi-live2d-display';

// 为 Live2DModel 注册 Ticker
Live2DModel.registerTicker(Ticker);

// 为 Application 注册 Ticker
Application.registerPlugin(TickerPlugin);

// 注册 InteractionManager 以支持 Live2D 模型的自动交互
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

示例的 Live2D 模型 Mao (Cubism 5) 遵守 Live2D 的
[Free Material License](https://www.live2d.com/eula/live2d-free-material-license-agreement_en.html)
