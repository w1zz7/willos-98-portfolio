"use client";

import { openApp } from "./registry";

/**
 * Single routing point for "external" links inside WillOS 98.
 *
 * - mailto: / tel:  → open the Contact Notepad (in-window compose)
 * - any other URL  → open in the retro Internet Explorer window
 *
 * Use this anywhere you'd otherwise write `target="_blank"` or a bare `<a>`.
 */
export function openLink(url: string) {
  if (/^mailto:/i.test(url) || /^tel:/i.test(url)) {
    openApp("contact");
    return;
  }
  openApp("ie", { url });
}
