"use client";
import React from 'react';
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
import dynamic from 'next/dynamic';
const CalEmbed = dynamic(() => import('@calcom/embed-react'), { ssr: false });

export function ScheduleCallModal({ trigger }: { trigger: React.ReactNode }) {
    return (
        <Dialog>
            <DialogTrigger asChild>{trigger}</DialogTrigger>
            <DialogContent className="max-w-4xl">
                <DialogHeader>
                    <DialogTitle>Schedule a Call</DialogTitle>
                </DialogHeader>
                <div className="w-full min-h-[600px]">
                    <CalEmbed
                        calLink="lacymorrow/dev"
                        className="w-full h-full"
                        config={{ layout: 'month_view' }}
                    />
                </div>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button variant="outline">Close</Button>
                    </DialogClose>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
