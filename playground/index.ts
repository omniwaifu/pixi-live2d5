// run this to tell git not to track this file
// git update-index --skip-worktree test/playground/index.ts

import { Application, Ticker, Sprite, Texture } from "pixi.js";
import { Live2DModel } from "../src";
import { HitAreaFrames } from "../src/extra";
import { config } from "../src/config";

Live2DModel.registerTicker(Ticker);

// Enable sound playback
config.sound = true;

const cubism5Model = "/test/assets/Mao/Mao.model3.json";

(async function main() {
    const app = new Application({
        view: document.getElementById("canvas") as HTMLCanvasElement,
        autoStart: true,
        resizeTo: window,
        backgroundColor: 0x333333,
    });
    (window as any).app = app;

    const model5 = await Live2DModel.from(cubism5Model);

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

    // Set up mouse tracking
    setupMouseTracking(model5, app.view as HTMLCanvasElement);
})();

function draggable(model: Live2DModel) {
    model.eventMode = 'static';
    model.cursor = 'pointer';
    model.on("pointerdown", (e: any) => {
        (model as any).dragging = true;
        (model as any)._pointerX = e.data.global.x - model.x;
        (model as any)._pointerY = e.data.global.y - model.y;
    });
    model.on("pointermove", (e: any) => {
        if ((model as any).dragging) {
            model.position.x = e.data.global.x - (model as any)._pointerX;
            model.position.y = e.data.global.y - (model as any)._pointerY;
        }
    });
    model.on("pointerupoutside", () => ((model as any).dragging = false));
    model.on("pointerup", () => ((model as any).dragging = false));
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

function setupMouseTracking(model: Live2DModel, canvas: HTMLCanvasElement) {
    const onMouseMove = (event: MouseEvent) => {
        if (!canvas) return;
        
        const rect = canvas.getBoundingClientRect();
        
        // Convert screen coordinates to canvas coordinates
        const canvasX = event.clientX - rect.left;
        const canvasY = event.clientY - rect.top;
        
        // Convert to normalized coordinates [-1, 1]
        const normalizedX = (canvasX / rect.width) * 2 - 1;
        const normalizedY = -((canvasY / rect.height) * 2 - 1);
        
        // Apply to focus controller
        model.internalModel.focusController.focus(normalizedX, normalizedY);
    };
    
    // Add global mouse move listener
    document.addEventListener('mousemove', onMouseMove);
}
