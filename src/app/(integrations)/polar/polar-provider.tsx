'use client';

import { Checkout } from "@polar-sh/nextjs";
import { polarConfig } from "./config";
import type { ReactNode } from "react";

interface PolarProviderProps {
    children: ReactNode;
}

export function PolarProvider({ children }: PolarProviderProps) {
    const checkoutHandler = Checkout(polarConfig);

    return (
        <>
            {children}
        </>
    );
}
