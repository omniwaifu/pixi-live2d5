import "./load-cores";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Application, Point, Ticker } from "pixi.js";
import * as PIXI from "pixi.js";

describe("Cubism 5 browser smoke", () => {
    let app: Application;
    let config: typeof import("../src/config").config;
    let Live2DModel: typeof import("../src").Live2DModel;
    let HitAreaFrames: typeof import("../src/extra").HitAreaFrames;

    beforeEach(async () => {
        document.body.innerHTML = "";
        (window as any).PIXI = PIXI;

        ({ config } = await import("../src/config"));
        ({ Live2DModel } = await import("../src"));
        ({ HitAreaFrames } = await import("../src/extra"));

        config.sound = false;
        Live2DModel.registerTicker(Ticker);

        app = new Application();
        await app.init({
            width: 960,
            height: 720,
            autoStart: false,
            preference: "webgl",
        });

        document.body.appendChild(app.canvas);
    });

    afterEach(() => {
        app.destroy(true);
        document.body.innerHTML = "";
        vi.restoreAllMocks();
    });

    it("loads the Mao model through the public Cubism 5 path", async () => {
        const model = await Live2DModel.from("/test/assets/Mao/Mao.model3.json", {
            autoHitTest: false,
        });

        app.stage.addChild(model);
        model.scale.set(0.12);
        model.position.set(120, 60);
        app.render();

        expect(Object.keys(model.internalModel.hitAreas)).toEqual(["Head", "Body"]);
        expect(await model.expression()).toBe(true);
        expect(await model.motion("TapBody", 0)).toBe(true);

        model.focus(model.x + model.width, model.y + model.height * 0.4, true);
        expect(model.internalModel.focusController.targetX).toBeGreaterThan(0);
    });

    it("creates hit area frames without Pixi warnings and exposes the expected hit areas", async () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        const model = await Live2DModel.from("/test/assets/Mao/Mao.model3.json", {
            autoHitTest: false,
        });

        app.stage.addChild(model);
        model.scale.set(0.12);
        model.position.set(120, 60);

        const frames = new HitAreaFrames();

        model.addChild(frames);
        app.render();

        const headWorld = model.toGlobal(
            new Point(model.internalModel.width * 0.5, model.internalModel.height * 0.18),
        );
        const bodyWorld = model.toGlobal(
            new Point(model.internalModel.width * 0.5, model.internalModel.height * 0.55),
        );

        expect(model.hitTest(headWorld.x, headWorld.y)).toContain("Head");
        expect(model.hitTest(bodyWorld.x, bodyWorld.y)).toContain("Body");
        expect(frames.texts.length).toBe(Object.keys(model.internalModel.hitAreas).length);
        expect(warnSpy).not.toHaveBeenCalled();
    });
});
