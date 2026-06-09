export function hexToBytes(hex: string): number[] {
    const clean = hex.trim().replace(/^0x/, '').replace(/\s+/g, '');
    if (clean.length % 2 !== 0) {
        throw new Error('Hex string must have an even number of characters');
    }
    if (!/^[0-9a-fA-F]*$/.test(clean)) {
        throw new Error('Hex string contains non-hex characters');
    }
    const bytes: number[] = [];
    for (let i = 0; i < clean.length; i += 2) {
        bytes.push(parseInt(clean.slice(i, i + 2), 16));
    }
    return bytes;
}

export function bytesToHex(bytes: ArrayLike<number>): string {
    let hex = '';
    for (let i = 0; i < bytes.length; i++) {
        hex += bytes[i].toString(16).padStart(2, '0');
    }
    return hex;
}

export function base64ToBytes(b64: string): Uint8Array {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}
