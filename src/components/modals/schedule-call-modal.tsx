"use client";
import {
    Dialog,
    DialogTrigger,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useMediaQuery } from '@/hooks/use-media-query';
import dynamic from 'next/dynamic';
import { Suspense } from 'react';

const CalEmbed = dynamic(() => import('@calcom/embed-react'), {
    ssr: false,
    loading: () => (
        <div className="flex flex-col items-center justify-center gap-4 p-6 w-full min-h-[400px]">
            <Skeleton className="h-8 w-48" />
            <div className="grid grid-cols-7 gap-2 w-full max-w-md">
                {Array.from({ length: 35 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full rounded-md" />
                ))}
            </div>
            <Skeleton className="h-16 w-full max-w-md" />
        </div>
    ),
});

export function ScheduleCallModal({ trigger }: { trigger: React.ReactNode }) {
    const isMobile = useMediaQuery("(max-width: 768px)");

    return (
        <Dialog>
            <DialogTrigger asChild>{trigger}</DialogTrigger>
            <DialogContent
                className={`${isMobile
                    ? 'w-[95vw] h-[85vh] max-w-none'
                    : 'max-w-4xl'
                    } p-0 max-h-[85vh] flex flex-col`}
            >
                <DialogHeader className="px-6 pt-6 pb-3">
                    <DialogTitle className={`${isMobile ? 'text-sm' : ''}`}>
                        Schedule a Call
                    </DialogTitle>
                </DialogHeader>
                <div
                    className={`w-full flex-1 overflow-y-auto min-h-0 ${isMobile
                        ? '[&::-webkit-scrollbar]:hidden [-webkit-overflow-scrolling:touch]'
                        : ''
                        }`}
                    style={isMobile ? {
                        WebkitOverflowScrolling: 'touch',
                        scrollbarWidth: 'none',
                        msOverflowStyle: 'none'
                    } : {}}
                >
                    <Suspense fallback={
                        <div className="flex flex-col items-center justify-center gap-4 p-6 w-full min-h-[400px]">
                            <Skeleton className="h-8 w-48" />
                            <div className="grid grid-cols-7 gap-2 w-full max-w-md">
                                {Array.from({ length: 35 }).map((_, i) => (
                                    <Skeleton key={i} className="h-10 w-full rounded-md" />
                                ))}
                            </div>
                            <Skeleton className="h-16 w-full max-w-md" />
                        </div>
                    }>
                        <CalEmbed
                            calLink="lacymorrow/dev"
                            className="w-full h-full"
                            style={{
                                width: '100%',
                                height: '100%',
                                minHeight: '400px'
                            }}
                            config={{
                                layout: isMobile ? 'week_view' : 'month_view',
                                theme: 'auto',
                            }}
                        />
                    </Suspense>
                </div>
                <DialogFooter className="px-6 pb-6 pt-3">
                    <DialogClose asChild>
                        <Button variant="outline" size={isMobile ? 'sm' : 'default'}>
                            Close
                        </Button>
                    </DialogClose>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
