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
