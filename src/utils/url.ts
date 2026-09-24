const ABSOLUTE_SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const DUMMY_ORIGIN = "http://pixi-live2d.local";

/**
 * Resolves a relative URL/path against a base URL/path.
 *
 * This is a small replacement for Pixi v7's deprecated `utils.url.resolve`.
 * Absolute URLs (`https:`, `blob:`, `data:`, etc.) are returned as full URLs. Otherwise it
 * intentionally preserves "path-like" inputs by returning a path instead of a full URL with an
 * origin: scheme-relative inputs (`//host/...`) stay scheme-relative, rooted inputs
 * (`/foo/bar.json`) stay rooted, and relative inputs stay relative.
 */
export function resolveUrl(base: string, path: string): string {
    if (ABSOLUTE_SCHEME.test(path)) {
        return new URL(path).toString();
    }

    if (ABSOLUTE_SCHEME.test(base)) {
        return new URL(path, base).toString();
    }

    const resolved = new URL(path, new URL(base, DUMMY_ORIGIN));
    const resolvedPath = `${resolved.pathname}${resolved.search}${resolved.hash}`;

    if (base.startsWith("//") || path.startsWith("//")) {
        return `//${resolved.host}${resolvedPath}`;
    }

    if (base.startsWith("/") || path.startsWith("/")) {
        return resolvedPath;
    }

    return resolvedPath.replace(/^\/+/, "");
}

/**
 * Normalizes a raw file path (e.g. an uploaded file's `webkitRelativePath` or a ZIP entry name)
 * into the same form that {@link resolveUrl} produces, so both can be compared directly.
 */
export function normalizePath(path: string): string {
    return resolveUrl("", path);
}
