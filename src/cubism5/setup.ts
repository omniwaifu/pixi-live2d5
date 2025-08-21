import { logger } from "@/utils";
import type { CubismStartupOption } from "@cubism/live2dcubismframework";
import { CubismFramework, LogLevel } from "@cubism/live2dcubismframework";

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
export function startUpCubism5(options?: CubismStartupOption) {
    options = Object.assign(
        {
            logFunction: console.log,
            loggingLevel: LogLevel.LogLevel_Verbose,
        },
        options,
    );

    CubismFramework.startUp(options);
    CubismFramework.initialize();
}
