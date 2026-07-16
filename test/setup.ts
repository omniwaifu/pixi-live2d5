// R5 reads Core blend-mode constants while Framework modules are evaluated. Node tests use a
// focused Core stub; browser tests load the real runtime through test/load-cores.ts instead.
if (typeof window === "undefined") {
    const globalScope = globalThis as any;

    globalScope.Live2DCubismCore ??= {
        ColorBlendType_Normal: 0,
        ColorBlendType_AddCompatible: 1,
        ColorBlendType_MultiplyCompatible: 2,
        ColorBlendType_Add: 3,
        ColorBlendType_AddGlow: 4,
        ColorBlendType_Darken: 5,
        ColorBlendType_Multiply: 6,
        ColorBlendType_ColorBurn: 7,
        ColorBlendType_LinearBurn: 8,
        ColorBlendType_Lighten: 9,
        ColorBlendType_Screen: 10,
        ColorBlendType_ColorDodge: 11,
        ColorBlendType_Overlay: 12,
        ColorBlendType_SoftLight: 13,
        ColorBlendType_HardLight: 14,
        ColorBlendType_LinearLight: 15,
        ColorBlendType_Hue: 16,
        ColorBlendType_Color: 17,
        Logging: {
            csmSetLogFunction() {},
            csmGetLogFunction() {
                return undefined;
            },
        },
        Memory: {
            initializeAmountOfMemory() {},
        },
        Version: {
            csmGetVersion() {
                return 0;
            },
        },
    };
}
