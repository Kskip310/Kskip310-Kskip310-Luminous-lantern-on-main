
// services/utils.ts

export const isObject = (obj: any): obj is object => obj && typeof obj === 'object' && !Array.isArray(obj);

export function deepMerge<T extends object>(target: T, source: Partial<T>): T {
  const output = { ...target };
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach((key) => {
      const sourceKey = key as keyof T;
      if (isObject(source[sourceKey]) && sourceKey in target && isObject(target[sourceKey])) {
        output[sourceKey] = deepMerge(target[sourceKey] as object, source[sourceKey] as object) as T[keyof T];
      } else {
        (output as any)[sourceKey] = source[sourceKey];
      }
    });
  }
  return output;
}

// FIX: Add a UUID generator to be used for creating unique IDs without external libraries.
export function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
