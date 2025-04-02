import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Función para convertir de snake_case a camelCase
const toCamelCase = (str: string) =>
  str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());

// Función recursiva para convertir todo el objeto
export const convertToCamelCase = (obj: any): any => {
  if (Array.isArray(obj)) {
      return obj.map((item) => convertToCamelCase(item));
  } else if (obj && typeof obj === "object") {
      return Object.keys(obj).reduce((acc, key) => {
          const camelKey = toCamelCase(key);
          acc[camelKey] = convertToCamelCase(obj[key]);
          return acc;
      }, {} as any);
  }
  return obj;
};
