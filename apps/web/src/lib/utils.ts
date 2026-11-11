import type { QueryClient } from '@tanstack/react-query';
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function ellipsify(str = '', len = 4, delimiter = '..') {
    const strLen = str.length;
    const limit = len * 2 + delimiter.length;

    return strLen >= limit ? str.substring(0, len) + delimiter + str.substring(strLen - len, strLen) : str;
}

export type InvalidateQueryKeys = readonly (readonly string[])[];

export function invalidateWithDelay(queryClient: QueryClient, queryKeys: InvalidateQueryKeys, delayMs = 500): void {
    queryKeys.forEach(key => void queryClient.invalidateQueries({ queryKey: [...key] }));
    setTimeout(() => {
        queryKeys.forEach(key => void queryClient.invalidateQueries({ queryKey: [...key] }));
    }, delayMs);
}
