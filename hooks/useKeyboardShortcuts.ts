
import { useEffect } from 'react';

/**
 * Nexus AI Keyboard Shortcuts Documentation:
 * 
 * NAVIGATION & UI:
 * - Mod + N: Create a new 'General' chat session with Flash model.
 * - Mod + B: Toggle the sidebar visibility.
 * - Mod + F: Focus the chat history search input.
 * - Escape: Close any open modals (Settings, Persona, Camera).
 * 
 * SESSION SWITCHING:
 * - Mod + [1-9]: Switch directly to the corresponding chat session in history.
 * 
 * Note: 'Mod' refers to Command (⌘) on macOS and Control (Ctrl) on Windows/Linux.
 */

type ShortcutHandler = (e: KeyboardEvent) => void;

interface ShortcutMap {
  [key: string]: ShortcutHandler;
}

export const useKeyboardShortcuts = (shortcuts: ShortcutMap) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isMod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      const shift = event.shiftKey;

      // Handle Numeric Shortcuts (Mod + 1-9)
      if (isMod && /^[1-9]$/.test(event.key)) {
        if (shortcuts['mod+number']) {
          shortcuts['mod+number'](event);
        }
        return;
      }

      // Map keys to shortcut strings
      let shortcutStr = '';
      if (isMod) shortcutStr += 'mod+';
      if (shift) shortcutStr += 'shift+';
      shortcutStr += key;

      if (shortcuts[shortcutStr]) {
        event.preventDefault();
        shortcuts[shortcutStr](event);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts]);
};
