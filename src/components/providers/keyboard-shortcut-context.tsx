"use client";

import type React from "react";
import { createContext, useContext, useEffect, useCallback, useState, useMemo } from "react";
import { useHotkeys } from "@mantine/hooks";
import type { HotkeyItem } from "@mantine/hooks";
import {
	shortcutConfig,
	ShortcutAction,
	type ShortcutActionType,
} from "@/config/keyboard-shortcuts";

interface ShortcutHandler {
	action: ShortcutActionType;
	callback: (event: KeyboardEvent) => void;
	isActive?: () => boolean; // Optional condition to check if the shortcut should be active
}

interface KeyboardShortcutContextProps {
	registerShortcut: (handler: ShortcutHandler) => () => void; // Returns an unregister function
	triggerAction: (action: ShortcutActionType, event?: KeyboardEvent) => void;
}

const KeyboardShortcutContext = createContext<KeyboardShortcutContextProps | null>(null);

interface KeyboardShortcutProviderProps {
	children: React.ReactNode;
}

export function KeyboardShortcutProvider({ children }: KeyboardShortcutProviderProps): JSX.Element {
	const [handlers, setHandlers] = useState<Map<ShortcutActionType, Set<ShortcutHandler>>>(
		new Map()
	);

	const registerShortcut = useCallback((handler: ShortcutHandler) => {
		setHandlers((prevHandlers) => {
			const newHandlers = new Map(prevHandlers);
			const currentSet = newHandlers.get(handler.action) || new Set();
			currentSet.add(handler);
			newHandlers.set(handler.action, currentSet);
			return newHandlers;
		});

		// Return unregister function
		return () => {
			setHandlers((prevHandlers) => {
				const newHandlers = new Map(prevHandlers);
				const currentSet = newHandlers.get(handler.action);
				if (currentSet) {
					currentSet.delete(handler);
					if (currentSet.size === 0) {
						newHandlers.delete(handler.action);
					} else {
						newHandlers.set(handler.action, currentSet);
					}
				}
				return newHandlers;
			});
		};
	}, []);

	const triggerAction = useCallback(
		(action: ShortcutActionType, event?: KeyboardEvent) => {
			const actionHandlers = handlers.get(action);
			if (actionHandlers) {
				for (const handler of actionHandlers) {
					if (handler.isActive === undefined || handler.isActive()) {
						// Pass the original event if available, otherwise create a minimal one
						const syntheticEvent = event ?? new KeyboardEvent("keydown");
						handler.callback(syntheticEvent);
					}
				}
			}
		},
		[handlers]
	);

	const hotkeys = useMemo<ReadonlyArray<HotkeyItem>>(() => {
		return shortcutConfig.map(([hotkey, action]) => [
			hotkey,
			(event: KeyboardEvent) => {
				// Prevent default browser behavior for handled shortcuts if necessary
				// event.preventDefault(); // Uncomment if needed for specific shortcuts
				triggerAction(action, event);
			},
		]);
	}, [triggerAction]);

	// useHotkeys expects a mutable array, so we need to cast it.
	useHotkeys(hotkeys as HotkeyItem[]);

	const contextValue = useMemo(
		() => ({ registerShortcut, triggerAction }),
		[registerShortcut, triggerAction]
	);

	return (
		<KeyboardShortcutContext.Provider value={contextValue}>
			{children}
		</KeyboardShortcutContext.Provider>
	);
}

export function useKeyboardShortcutContext(): KeyboardShortcutContextProps {
	const context = useContext(KeyboardShortcutContext);
	if (!context) {
		throw new Error("useKeyboardShortcutContext must be used within a KeyboardShortcutProvider");
	}
	return context;
}

/**
 * Custom hook to register a keyboard shortcut handler.
 *
 * @param action The shortcut action to listen for.
 * @param callback The function to execute when the shortcut is triggered.
 * @param isActive Optional function to determine if the shortcut is currently active.
 *                 Useful for shortcuts that should only work in specific contexts (e.g., modal open).
 * @param deps Optional dependency array for the callback function.
 */
export function useKeyboardShortcut(
	action: ShortcutActionType,
	callback: (event: KeyboardEvent) => void,
	isActive?: () => boolean,
	deps: React.DependencyList = []
): void {
	const { registerShortcut } = useKeyboardShortcutContext();

	// Memoize the callback to prevent unnecessary re-registrations
	// eslint-disable-next-line react-hooks/exhaustive-deps
	const memoizedCallback = useCallback(callback, deps);
	// eslint-disable-next-line react-hooks/exhaustive-deps
	const memoizedIsActive = useCallback(isActive ?? (() => true), deps);

	useEffect(() => {
		const handler: ShortcutHandler = {
			action,
			callback: memoizedCallback,
			isActive: memoizedIsActive,
		};
		const unregister = registerShortcut(handler);

		// Cleanup function to unregister the shortcut when the component unmounts or dependencies change
		return () => {
			unregister();
		};
		// We only want registration to happen based on the memoized functions and action
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [action, registerShortcut, memoizedCallback, memoizedIsActive]);
}
