import { CSM_LOG_LEVEL_WARNING } from "@cubism/cubismframeworkconfig";

const LOG_LEVEL_VERBOSE = 0;
const LOG_LEVEL_WARNING = 1;
const LOG_LEVEL_ERROR = 2;
const LOG_LEVEL_NONE = 999;
const DEFAULT_VERSION = "dev";
const globalFlags = globalThis as typeof globalThis & {
    __DEV__?: boolean;
    __VERSION__?: string;
};

const isDev = typeof globalFlags.__DEV__ === "boolean" ? globalFlags.__DEV__ : false;
const version =
    typeof globalFlags.__VERSION__ === "string" ? globalFlags.__VERSION__ : DEFAULT_VERSION;

/**
 * Global configs.
 */
export const config = {
    LOG_LEVEL_VERBOSE,
    LOG_LEVEL_WARNING,
    LOG_LEVEL_ERROR,
    LOG_LEVEL_NONE,

    /**
     * Global log level.
     * @default config.LOG_LEVEL_WARNING
     */
    logLevel: isDev ? LOG_LEVEL_VERBOSE : LOG_LEVEL_WARNING,

    /**
     * Enabling sound for motions.
     */
    sound: true,

    /**
     * Deferring motion and corresponding sound until both are loaded.
     */
    motionSync: true,

    /**
     * Default fading duration for motions without such value specified.
     */
    motionFadingDuration: 500,

    /**
     * Default fading duration for idle motions without such value specified.
     */
    idleMotionFadingDuration: 2000,

    /**
     * Default fading duration for expressions without such value specified.
     */
    expressionFadingDuration: 500,

    /**
     * If false, expression will be reset to default when playing non-idle motions.
     */
    preserveExpressionOnMotion: true,

    cubism5: { logLevel: CSM_LOG_LEVEL_WARNING },
};

/**
 * Consistent with the `version` in package.json.
 */
export const VERSION = version;
