export function toCubismJsonBuffer(data: ArrayBuffer | object | string): {
    buffer: ArrayBuffer;
    byteLength: number;
} {
    if (data instanceof ArrayBuffer) {
        return {
            buffer: data,
            byteLength: data.byteLength,
        };
    }

    const encoded = new TextEncoder().encode(
        typeof data === "string" ? data : JSON.stringify(data),
    );

    return {
        buffer: encoded.buffer,
        byteLength: encoded.byteLength,
    };
}
