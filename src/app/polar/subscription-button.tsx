'use client';

import { Button } from "@/components/ui/button";
import { useState } from "react";

interface SubscriptionButtonProps {
    tier: string;
    className?: string;
}

export function SubscriptionButton({ tier, className }: SubscriptionButtonProps) {
    const [isLoading, setIsLoading] = useState(false);

    const handleSubscribe = async () => {
        setIsLoading(true);
        try {
            // Redirect to Polar checkout with the correct query parameter
            window.location.href = `/polar/checkout?productPriceId=${tier}`;
        } catch (error) {
            console.error('Failed to start subscription:', error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Button
            onClick={handleSubscribe}
            disabled={isLoading}
            className={className}
        >
            {isLoading ? "Loading..." : "Subscribe"}
        </Button>
    );
}
