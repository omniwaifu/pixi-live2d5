/**
 * Resolves a relative URL/path against a base URL/path.
 *
 * This is a small replacement for Pixi v7's deprecated `utils.url.resolve`.
 * It intentionally preserves "path-like" inputs (e.g. `/foo/bar.json`) by returning a path
 * instead of a full absolute URL with an origin.
 */
export function resolveUrl(base: string, path: string): string {
    // Already absolute (http:, https:, blob:, data:, etc.)
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(base)) {
        return new URL(path, base).toString();
    }

    const dummyOrigin = "http://pixi-live2d.local";
    const resolved = new URL(path, new URL(base, dummyOrigin));
    const resolvedPath = `${resolved.pathname}${resolved.search}${resolved.hash}`;

    // Preserve the base input style: leading "/" stays absolute-path, otherwise stay relative.
    if (base.startsWith("/")) {
        return resolvedPath;
    }

    return resolvedPath.replace(/^\/+/, "");
}
