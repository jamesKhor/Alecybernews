import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Strip markdown formatting from a string for plain-text display.
 * Handles: **bold**, *italic*, `code`, [link](url), # headings, > blockquotes
 */
export function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1") // **bold**
    .replace(/\*(.+?)\*/g, "$1") // *italic*
    .replace(/__(.+?)__/g, "$1") // __bold__
    .replace(/_(.+?)_/g, "$1") // _italic_
    .replace(/`(.+?)`/g, "$1") // `code`
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // [text](url)
    .replace(/^#{1,6}\s+/gm, "") // # headings
    .replace(/^>\s+/gm, "") // > blockquotes
    .replace(/~~(.+?)~~/g, "$1") // ~~strikethrough~~
    .replace(/\n+/g, " ") // newlines → space
    .trim();
}
