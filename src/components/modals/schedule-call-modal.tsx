"use client";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMediaQuery } from "@/hooks/use-media-query";
import dynamic from "next/dynamic";
import { Suspense } from "react";

const CalEmbed = dynamic(() => import("@calcom/embed-react"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[400px] w-full flex-col items-center justify-center gap-4 p-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid w-full max-w-md grid-cols-7 gap-2">
        {Array.from({ length: 35 }).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length skeleton placeholders, never reordered
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
        className={`${
          isMobile ? "h-[85vh] w-[95vw] max-w-none" : "max-w-4xl"
        } flex max-h-[85vh] flex-col p-0`}
      >
        <DialogHeader className="px-6 pt-6 pb-3">
          <DialogTitle className={`${isMobile ? "text-sm" : ""}`}>Schedule a Call</DialogTitle>
        </DialogHeader>
        <div
          className={`min-h-0 w-full flex-1 overflow-y-auto ${
            isMobile ? "[-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden" : ""
          }`}
          style={
            isMobile
              ? {
                  WebkitOverflowScrolling: "touch",
                  scrollbarWidth: "none",
                  msOverflowStyle: "none",
                }
              : {}
          }
        >
          <Suspense
            fallback={
              <div className="flex min-h-[400px] w-full flex-col items-center justify-center gap-4 p-6">
                <Skeleton className="h-8 w-48" />
                <div className="grid w-full max-w-md grid-cols-7 gap-2">
                  {Array.from({ length: 35 }).map((_, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length skeleton placeholders, never reordered
                    <Skeleton key={i} className="h-10 w-full rounded-md" />
                  ))}
                </div>
                <Skeleton className="h-16 w-full max-w-md" />
              </div>
            }
          >
            <CalEmbed
              calLink="build-and-serve/discovery"
              className="h-full w-full"
              style={{
                width: "100%",
                height: "100%",
                minHeight: "400px",
              }}
              config={{
                layout: isMobile ? "week_view" : "month_view",
                theme: "auto",
              }}
            />
          </Suspense>
        </div>
        <DialogFooter className="px-6 pt-3 pb-6">
          <DialogClose asChild>
            <Button variant="outline" size={isMobile ? "sm" : "default"}>
              Close
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
