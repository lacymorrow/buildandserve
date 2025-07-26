import type { HotkeyItem } from "@mantine/hooks";

/**
 * Defines unique identifiers for each keyboard shortcut action.
 */
export const ShortcutAction = {
	OPEN_COMMAND_MENU: "open-command-menu",
	OPEN_SEARCH_MENU: "open-search-menu",
	OPEN_AI_SEARCH: "open-ai-search",
	TOGGLE_SIDEBAR: "toggle-sidebar",
	SUBMIT_AI_PROMPT: "submit-ai-prompt",
	LOGOUT_USER: "logout-user",
	CLOSE_POPOVER: "close-popover",
	SET_THEME_LIGHT: "set-theme-light",
	SET_THEME_DARK: "set-theme-dark",
	SET_THEME_SYSTEM: "set-theme-system",
	GOTO_ADMIN: "goto-admin",
	GOTO_SETTINGS: "goto-settings",
	// Add other actions as needed
} as const;

export type ShortcutActionType = (typeof ShortcutAction)[keyof typeof ShortcutAction];

/**
 * Maps keyboard shortcuts (using Mantine's HotkeyItem format) to actions.
 * @see https://mantine.dev/hooks/use-hotkeys/
 *
 * Remember to update this map when adding new shortcuts or changing keybindings.
 */
export const shortcutConfig: ReadonlyArray<readonly [string, ShortcutActionType]> = [
	// Menus & Toggles
	["mod+shift+F", ShortcutAction.OPEN_COMMAND_MENU],
	["mod+shift+K", ShortcutAction.OPEN_SEARCH_MENU],
	["/", ShortcutAction.OPEN_SEARCH_MENU],
	["mod+K", ShortcutAction.OPEN_AI_SEARCH],
	["mod+shift+B", ShortcutAction.TOGGLE_SIDEBAR],
	["Escape", ShortcutAction.CLOSE_POPOVER],

	// App Actions
	["mod+Enter", ShortcutAction.SUBMIT_AI_PROMPT],
	["mod+shift+X", ShortcutAction.LOGOUT_USER],

	// Theme
	["mod+shift+L", ShortcutAction.SET_THEME_LIGHT],
	["mod+shift+D", ShortcutAction.SET_THEME_DARK],
	["mod+shift+Y", ShortcutAction.SET_THEME_SYSTEM],

	// Navigation
	["mod+shift+A", ShortcutAction.GOTO_ADMIN],
	["mod+shift+,", ShortcutAction.GOTO_SETTINGS],
	// Add other shortcuts here
];

// ... rest of the file remains the same ...
