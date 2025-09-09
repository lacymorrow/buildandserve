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
import { useMediaQuery } from '@/hooks/use-media-query';
import dynamic from 'next/dynamic';

const CalEmbed = dynamic(() => import('@calcom/embed-react'), { ssr: false });

export function ScheduleCallModal({ trigger }: { trigger: React.ReactNode }) {
    const isMobile = useMediaQuery("(max-width: 768px)");

    return (
        <Dialog>
            <DialogTrigger asChild>{trigger}</DialogTrigger>
            <DialogContent
                className={`${isMobile
                    ? 'w-[95vw] h-[85vh] max-w-none'
                    : 'max-w-4xl'
                    } p-0`}
            >
                <DialogHeader className={`${isMobile ? 'px-4 py-2' : ''}`}>
                    <DialogTitle className={`${isMobile ? 'text-sm' : ''}`}>
                        Schedule a Call
                    </DialogTitle>
                </DialogHeader>
                <div
                    className={`w-full ${isMobile
                        ? 'h-[calc(85vh-120px)] overflow-y-auto [&::-webkit-scrollbar]:hidden [-webkit-overflow-scrolling:touch]'
                        : 'min-h-[400px]'
                        }`}
                    style={isMobile ? {
                        WebkitOverflowScrolling: 'touch',
                        scrollbarWidth: 'none',
                        msOverflowStyle: 'none'
                    } : {}}
                >
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
                </div>
                <DialogFooter className={`${isMobile ? 'px-4 py-2' : ''}`}>
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
