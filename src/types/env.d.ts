/// <reference types="vite/client" />

declare global {
    let __DEV__: boolean | undefined;
    let __VERSION__: string | undefined;
    const __HEADLESS__: string;
    let PIXI:
        | undefined
        | (typeof import("pixi.js") & {
              live2d: typeof import("../index") & typeof import("../extra");
          });
}

export {};
