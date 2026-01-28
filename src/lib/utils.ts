import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getApiUrl(path: string): string {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH && process.env.NEXT_PUBLIC_BASE_PATH !== '/' 
    ? process.env.NEXT_PUBLIC_BASE_PATH 
    : '';
  return `${basePath}${path.startsWith('/') ? '' : '/'}${path}`;
}
