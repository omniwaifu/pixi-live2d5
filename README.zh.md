# pixi-live2d-display

![GitHub package.json version](https://img.shields.io/github/package-json/v/omniwaifu/pixi-live2d5?style=flat-square)
![Cubism version](https://img.shields.io/badge/Cubism-5-ff69b4?style=flat-square)
![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/omniwaifu/pixi-live2d5/test.yml?style=flat-square)

为 [PixiJS](https://github.com/pixijs/pixi.js) v8 提供的 Live2D 插件。

这个 fork 专注于 Cubism 5 Web runtime 和 PixiJS 8。它保留了原项目较高层次的模型 API，但把支持范围收敛到这个仓库真正会构建、生成类型并进行测试的生产路径。

#### 特性

-   支持 Cubism 5 Live2D 模型
-   对仍然能被 Cubism 5 SDK 加载的旧版 `.moc3` / `.model3.json` 模型提供 best-effort 兼容
-   支持 PIXI.RenderTexture 和 PIXI.Filter
-   Pixi 风格的变换 API：position, scale, rotation, skew, anchor
-   自动交互：鼠标跟踪, 点击命中检测
-   比官方框架更好的动作预约逻辑
-   从上传的文件或 zip 文件中加载 (实验性功能)
-   完善的类型定义 - 我们都喜欢类型！

#### 要求

-   PixiJS：8.x
-   Cubism core：5
-   浏览器：WebGL， ES6

#### 文档

-   [文档](https://guansss.github.io/pixi-live2d-display)（暂无中文翻译）
-   [API 文档](https://guansss.github.io/pixi-live2d-display/api/index.html)

## Cubism

Cubism 是 Live2D SDK 的名称。这个 fork 只提供 Cubism 5 的集成。

#### Cubism Core

在使用该插件之前，你需要加载 Cubism 运行时，也就是 Cubism Core。

Cubism 5 需要加载 `live2dcubismcore.min.js` 或 `live2dcubismcore.js`，可以从 [Cubism 5 SDK](https://www.live2d.com/download/cubism-sdk/download-web/) 里获取。

#### 打包文件

该包提供根入口和 `pixi-live2d-display/cubism5` 两种入口。旧的 `cubism2` / `cubism4` 子路径不属于这个 fork 的公开支持范围。

## 安装

#### 通过 GitHub 安装（此 fork）

```sh
npm install github:omniwaifu/pixi-live2d5
```

或者指定某个 commit / tag：

```sh
npm install github:omniwaifu/pixi-live2d5#master
```

```js
import { Live2DModel } from "pixi-live2d-display";

// 保留用于兼容的显式 Cubism 5 入口
import { Live2DModel } from "pixi-live2d-display/cubism5";
```

#### 本地开发

```sh
git clone https://github.com/omniwaifu/pixi-live2d5.git
cd pixi-live2d5
npm install
npm run setup
npm run build
```

`npm run setup` 会下载 playground 和浏览器 smoke test 所需的 Cubism 5 Core 文件。

然后在你的项目里 link：

```sh
npm link
# 在你的项目目录下：
npm link pixi-live2d-display
```

## 基础使用

```javascript
import * as PIXI from "pixi.js";
import { Live2DModel } from "pixi-live2d-display";

// 将 PIXI 暴露到 window 上，这样插件就可以通过 window.PIXI.Ticker 来自动更新模型
window.PIXI = PIXI;

(async function () {
    const app = new PIXI.Application();

    await app.init({
        canvas: document.getElementById("canvas"),
        resizeTo: window,
    });

    const model = await Live2DModel.from("mao.model3.json");

    app.stage.addChild(model);

    // 变换
    model.x = 100;
    model.y = 100;
    model.rotation = Math.PI;
    model.skew.x = Math.PI;
    model.scale.set(2, 2);
    model.anchor.set(0.5, 0.5);

    // 交互
    model.on("hit", (hitAreas) => {
        if (hitAreas.includes("body")) {
            model.motion("tap_body");
        }
    });
})();
```

`Live2DModel.from()` 期望接收 Cubism 5 兼容的 `model3.json` 模型。较早的 Cubism 3/4 时代 `.moc3` 模型如果仍能被 Cubism 5 SDK 接受，通常也可以工作；但 Cubism 2 的 `.model.json` / `.moc` 资源不在这个 fork 的支持范围内。

## 按需导入 Pixi 包

```javascript
import { Application, Ticker } from "pixi.js";
import { Live2DModel } from "pixi-live2d-display";

// 为 Live2DModel 注册 Ticker
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

示例的 Live2D 模型 Mao (Cubism 5) 遵守 Live2D 的
[Free Material License](https://www.live2d.com/eula/live2d-free-material-license-agreement_en.html)
