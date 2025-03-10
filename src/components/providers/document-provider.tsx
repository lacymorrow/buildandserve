"use client";

import type { ReactNode } from "react";
import { BodyProvider } from "./body-provider";

interface DocumentProviderProps {
    children: ReactNode;
    /**
     * HTML language attribute
     * @default "en"
     */
    lang?: string;
    /**
     * Whether to suppress hydration warnings
     * @default true
     */
    suppressHydrationWarning?: boolean;
    /**
     * Additional HTML attributes
     */
    htmlAttributes?: Record<string, string>;
    /**
     * Additional body attributes
     */
    bodyAttributes?: Record<string, string>;
}

/**
 * Document provider component that handles HTML and body attributes
 * Can be used in both App Router and Pages Router
 */
export function DocumentProvider({
    children,
    lang = "en",
    suppressHydrationWarning = true,
    htmlAttributes = {},
    bodyAttributes = {},
}: DocumentProviderProps) {
    // For client components in App Router, we can't modify the HTML element
    // This component is primarily for Pages Router or for wrapping body content in App Router

    // In App Router, this will be used inside the RootLayout component
    // In Pages Router, this will be used inside the Document component

    return <BodyProvider attributes={bodyAttributes}>{children}</BodyProvider>;
}

/**
 * HTML attributes for use in App Router's layout.tsx or Pages Router's _document.tsx
 */
export function getHtmlAttributes(
    lang = "en",
    suppressHydrationWarning = true,
    additionalAttributes = {}
) {
    return {
        lang,
        suppressHydrationWarning,
        ...additionalAttributes,
    };
}
