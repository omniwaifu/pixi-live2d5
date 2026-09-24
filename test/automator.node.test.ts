import { Ticker } from "pixi.js";
import { afterEach, describe, expect, it } from "vitest";
import { Live2DModel } from "../src/Live2DModel";

const tickers: Ticker[] = [];
const models: Live2DModel[] = [];

function createTicker(): Ticker {
    const ticker = new Ticker();

    ticker.autoStart = false;
    ticker.stop();
    // Establish a deterministic starting timestamp so each tick advances exactly 16 ms.
    ticker.update(0);
    tickers.push(ticker);

    return ticker;
}

function createModel(ticker: Ticker): Live2DModel {
    const model = new Live2DModel({
        ticker,
        autoUpdate: false,
        autoHitTest: false,
        autoFocus: false,
    });

    models.push(model);

    return model;
}

function tick(ticker: Ticker): void {
    ticker.update(ticker.lastTime + 16);
}

afterEach(() => {
    for (const model of models.splice(0)) {
        if (!model.destroyed) {
            model.destroy();
        }
    }
    for (const ticker of tickers.splice(0)) {
        ticker.destroy();
    }
});

describe("Automator auto update", () => {
    it("advances the model once per tick when enabled repeatedly", () => {
        const ticker = createTicker();
        const model = createModel(ticker);

        model.automator.autoUpdate = true;
        model.automator.autoUpdate = true;

        tick(ticker);
        expect(model.elapsedTime).toBe(16);

        tick(ticker);
        expect(model.elapsedTime).toBe(32);
    });

    it("stops on disable and resumes exactly once after re-enabling and replacing tickers", () => {
        const first = createTicker();
        const second = createTicker();
        const model = createModel(first);

        model.automator.autoUpdate = true;
        tick(first);
        expect(model.elapsedTime).toBe(16);

        model.automator.autoUpdate = false;
        tick(first);
        expect(model.elapsedTime).toBe(16);

        model.automator.autoUpdate = true;
        model.automator.autoUpdate = true;
        tick(first);
        expect(model.elapsedTime).toBe(32);

        model.automator.ticker = second;
        model.automator.autoUpdate = true;
        tick(first);
        expect(model.elapsedTime).toBe(32);

        tick(second);
        expect(model.elapsedTime).toBe(48);
    });

    it("stops updating after destruction", () => {
        const ticker = createTicker();
        const model = createModel(ticker);

        model.automator.autoUpdate = true;
        model.automator.autoUpdate = true;
        tick(ticker);
        expect(model.elapsedTime).toBe(16);

        model.destroy();
        tick(ticker);
        expect(model.elapsedTime).toBe(16);

        model.automator.autoUpdate = true;
        tick(ticker);
        expect(model.elapsedTime).toBe(16);
    });
});
