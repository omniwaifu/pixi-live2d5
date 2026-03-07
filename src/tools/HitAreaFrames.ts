import type { Live2DModel } from "@/Live2DModel";
import {
    Container,
    Graphics,
    Rectangle,
    Text,
    TextStyle,
    type FederatedPointerEvent,
} from "pixi.js";

const tempBounds = new Rectangle();

export class HitAreaFrames extends Container {
    initialized = false;
    graphics = new Graphics();

    texts: Text[] = [];

    strokeWidth = 4;
    normalColor = 0xe31a1a;
    activeColor = 0x1ec832;

    constructor() {
        super();

        this.eventMode = "static";
        this.addChild(this.graphics);

        this.on("added", this.init).on("globalpointermove", this.onPointerMove);
        this.onRender = () => this.redraw();
    }

    init() {
        if (this.initialized) {
            return;
        }

        this.initialized = true;
        const internalModel = (this.parent as Live2DModel).internalModel;

        const textStyle = new TextStyle({
            fontSize: 24,
            fill: "#ffffff",
            stroke: {
                color: "#000000",
                width: 4,
            },
        });

        this.texts = Object.keys(internalModel.hitAreas).map((hitAreaName) => {
            const text = new Text({
                text: hitAreaName,
                style: textStyle,
            });

            text.visible = false;

            this.addChild(text);

            return text;
        });
    }

    onPointerMove(e: FederatedPointerEvent) {
        const hitAreaNames = (this.parent as Live2DModel).hitTest(e.global.x, e.global.y);

        this.texts.forEach((text) => {
            text.visible = hitAreaNames.includes(text.text);
        });
    }

    private redraw(): void {
        const internalModel = (this.parent as Live2DModel).internalModel;

        // extract scale from the transform matrix, and invert it to ease following calculation
        // https://math.stackexchange.com/a/13165
        const scale = 1 / Math.sqrt(this.worldTransform.a ** 2 + this.worldTransform.b ** 2);

        this.graphics.clear();

        this.texts.forEach((text) => {
            const bounds = internalModel.getDrawableBounds(
                internalModel.hitAreas[text.text]!.index,
                tempBounds,
            );
            const transform = internalModel.localTransform;

            bounds.x = bounds.x * transform.a + transform.tx;
            bounds.y = bounds.y * transform.d + transform.ty;
            bounds.width = bounds.width * transform.a;
            bounds.height = bounds.height * transform.d;

            this.graphics.rect(bounds.x, bounds.y, bounds.width, bounds.height).stroke({
                width: this.strokeWidth * scale,
                color: text.visible ? this.activeColor : this.normalColor,
            });

            text.x = bounds.x + this.strokeWidth * scale;
            text.y = bounds.y + this.strokeWidth * scale;
            text.scale.set(scale);
        });
    }
}
