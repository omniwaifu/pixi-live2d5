const cubismCoreSource = "__CUBISM_CORE_SOURCE__";
const globalScope = globalThis as typeof globalThis & {
    Live2DCubismCore?: unknown;
};

if (!globalScope.Live2DCubismCore) {
    (0, eval)(cubismCoreSource);
}

export {};
