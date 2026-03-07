import { config } from "@/config";
import { logger } from "@/utils";
import { CubismFramework, LogLevel } from "@cubism/live2dcubismframework";
import type { Cubism5StartupOptions } from "./types";

let startupPromise: Promise<void>;
let startupRetries = 20;

/**
 * Promises that the Cubism 5 framework is ready to work.
 * @return Promise that resolves if the startup has succeeded, rejects if failed.
 */
export function cubism5Ready(): Promise<void> {
    if (CubismFramework.isStarted()) {
        return Promise.resolve();
    }

    startupPromise ??= new Promise<void>((resolve, reject) => {
        function startUpWithRetry() {
            try {
                startUpCubism5();
                resolve();
            } catch (e) {
                startupRetries--;

                if (startupRetries < 0) {
                    const err = new Error("Failed to start up Cubism 5 framework.");

                    (err as any).cause = e;

                    reject(err);
                    return;
                }

                logger.log("Cubism5", "Startup failed, retrying 10ms later...");

                setTimeout(startUpWithRetry, 10);
            }
        }

        startUpWithRetry();
    });

    return startupPromise;
}

/**
 * Starts up Cubism 5 framework.
 */
export function startUpCubism5(options?: Cubism5StartupOptions) {
    options = Object.assign(
        {
            logFunction: console.log,
            loggingLevel: config.cubism5.logLevel ?? LogLevel.LogLevel_Warning,
        },
        options,
    );

    CubismFramework.startUp(options as any);
    CubismFramework.initialize();
}
