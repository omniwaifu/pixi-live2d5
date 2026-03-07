// run this to tell git not to track this file
// git update-index --skip-worktree test/playground/index.ts

import { Application, Sprite, Texture, Ticker, type FederatedPointerEvent } from "pixi.js";
import { Live2DModel } from "../src";
import { HitAreaFrames } from "../src/extra";
import { config } from "../src/config";

Live2DModel.registerTicker(Ticker);

// Enable sound playback
config.sound = true;

const DRAG_THRESHOLD = 6;
const cubism5Model = "/test/assets/Mao/Mao.model3.json";

(async function main() {
    const canvas = document.getElementById("canvas") as HTMLCanvasElement;

    const app = new Application();
    await app.init({
        canvas,
        autoStart: true,
        resizeTo: window,
        backgroundColor: 0x333333,
        preference: "webgl",
    });
    (window as any).app = app;

    const model5 = await Live2DModel.from(cubism5Model, {
        autoHitTest: false,
    });

    app.stage.addChild(model5);

    const scaleX = (innerWidth * 0.4) / model5.width;
    const scaleY = (innerHeight * 0.8) / model5.height;

    // fit the window
    model5.scale.set(Math.min(scaleX, scaleY));

    model5.y = innerHeight * 0.1;

    draggable(model5);
    addFrame(model5);
    addHitAreaFrames(model5);

    // handle tapping
    model5.on("hit", (hitAreas) => {
        if (hitAreas.includes("Body")) {
            model5.motion("TapBody");
        }

        if (hitAreas.includes("Head")) {
            model5.expression();
        }
    });
})();

function draggable(model: Live2DModel) {
    const state = {
        active: false,
        moved: false,
        startX: 0,
        startY: 0,
        pointerOffsetX: 0,
        pointerOffsetY: 0,
    };

    model.eventMode = "static";
    model.cursor = "grab";

    model.on("pointerdown", (event: FederatedPointerEvent) => {
        state.active = true;
        state.moved = false;
        state.startX = event.global.x;
        state.startY = event.global.y;
        state.pointerOffsetX = event.global.x - model.x;
        state.pointerOffsetY = event.global.y - model.y;
        model.cursor = "grabbing";
    });

    model.on("globalpointermove", (event: FederatedPointerEvent) => {
        if (!state.active) {
            return;
        }

        const distance = Math.hypot(event.global.x - state.startX, event.global.y - state.startY);

        if (distance >= DRAG_THRESHOLD) {
            state.moved = true;
        }

        model.position.set(
            event.global.x - state.pointerOffsetX,
            event.global.y - state.pointerOffsetY,
        );
    });

    const stopDragging = () => {
        state.active = false;
        model.cursor = "grab";
    };

    model.on("pointerupoutside", stopDragging);
    model.on("pointerup", stopDragging);
    model.on("pointertap", (event: FederatedPointerEvent) => {
        if (!state.moved) {
            model.tap(event.global.x, event.global.y);
        }
    });
}

function addFrame(model: Live2DModel) {
    const foreground = Sprite.from(Texture.WHITE);
    foreground.width = model.internalModel.width;
    foreground.height = model.internalModel.height;
    foreground.alpha = 0.2;

    model.addChild(foreground);

    checkbox("Model Frames", (checked) => (foreground.visible = checked));
}

function addHitAreaFrames(model: Live2DModel) {
    const hitAreaFrames = new HitAreaFrames();

    model.addChild(hitAreaFrames);

    checkbox("Hit Area Frames", (checked) => (hitAreaFrames.visible = checked));
}

function checkbox(name: string, onChange: (checked: boolean) => void) {
    const id = name.replace(/\W/g, "").toLowerCase();

    let checkbox = document.getElementById(id) as HTMLInputElement;

    if (!checkbox) {
        const p = document.createElement("p");
        p.innerHTML = `<input type="checkbox" id="${id}"> <label for="${id}">${name}</label>`;

        document.getElementById("control")!.appendChild(p);
        checkbox = p.firstChild as HTMLInputElement;
    }

    checkbox.addEventListener("change", () => {
        onChange(checkbox.checked);
    });

    onChange(checkbox.checked);
}
