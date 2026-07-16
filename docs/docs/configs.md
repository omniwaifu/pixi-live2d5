Configs are applied to all models.

```js
import { config } from "pixi-live2d5";

// log level
config.logLevel = config.LOG_LEVEL_WARNING; // LOG_LEVEL_VERBOSE, LOG_LEVEL_ERROR, LOG_LEVEL_NONE

// play sound for motions
config.sound = true;

// defer the playback of a motion and its sound until both are loaded
config.motionSync = true;

// default fade-in/fade-out durations in milliseconds, will be applied to
// motions/expressions that don't have these values specified
config.motionFadingDuration = 500;
config.idleMotionFadingDuration = 500;
config.expressionFadingDuration = 500;

// Public URL for the 13 external GLSL files required by Cubism SDK for Web R5.
// Configure this before the first Cubism 5 model is rendered.
config.cubism5ShaderPath = "/cubism5/shaders/";
```
