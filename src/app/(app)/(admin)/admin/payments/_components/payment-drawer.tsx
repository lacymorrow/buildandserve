"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
    Drawer,
    DrawerClose,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
} from "@/components/ui/drawer";
import { JsonViewer } from "@/components/ui/json-viewer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import type { PaymentData } from "@/server/services/payment-service";
import { format } from "date-fns";
import { CalendarDays, ChevronDown, ChevronUp, CreditCard, DollarSign, Mail, User } from "lucide-react";
import { useState } from "react";

interface PaymentDrawerProps {
    payment: PaymentData | null;
    open: boolean;
    onClose: () => void;
}

export const PaymentDrawer = ({ payment, open, onClose }: PaymentDrawerProps) => {
    const [isJsonOpen, setIsJsonOpen] = useState(false);
    if (!payment) return null;

    return (
        <Drawer open={open} onOpenChange={onClose}>
            <DrawerContent className="max-h-[90vh]">
                <ScrollArea className="max-h-[calc(90vh-8rem)]">
                    <div className="mx-auto w-full max-w-2xl">
                        <DrawerHeader>
                            <DrawerTitle>Payment Details</DrawerTitle>
                            <DrawerDescription>
                                Order ID: {payment.orderId}
                            </DrawerDescription>
                        </DrawerHeader>

                        <div className="p-6">
                            <div className="space-y-6">
                                {/* Basic Information */}
                                <section>
                                    <h3 className="text-lg font-semibold">Payment Information</h3>
                                    <div className="mt-4 grid gap-4">
                                        <Card className="overflow-hidden">
                                            <div className="bg-muted/40 p-6">
                                                <div className="flex items-center gap-4">
                                                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                                                        <CreditCard className="h-8 w-8 text-primary" />
                                                    </div>
                                                    <div>
                                                        <h4 className="text-xl font-medium">{payment.productName}</h4>
                                                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                            <DollarSign className="h-3 w-3" />
                                                            <span>{new Intl.NumberFormat("en-US", {
                                                                style: "currency",
                                                                currency: "USD",
                                                            }).format(typeof payment.amount === 'string' ? Number.parseFloat(payment.amount) : payment.amount)}</span>
                                                        </div>
                                                    </div>
                                                    <Badge
                                                        variant={
                                                            payment.status === "paid" ? "default" :
                                                                payment.status === "refunded" ? "destructive" : "secondary"
                                                        }
                                                        className="ml-auto"
                                                    >
                                                        {payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
                                                    </Badge>
                                                </div>
                                            </div>
                                            <CardContent className="p-0">
                                                <div className="grid grid-cols-1 divide-y sm:grid-cols-2 sm:divide-y-0 sm:divide-x">
                                                    <div className="p-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                                                                <CalendarDays className="h-5 w-5 text-primary" />
                                                            </div>
                                                            <div>
                                                                <p className="text-sm font-medium text-muted-foreground">Purchase Date</p>
                                                                <p className="font-medium">{format(payment.purchaseDate, "PPP")}</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="p-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                                                                <CreditCard className="h-5 w-5 text-primary" />
                                                            </div>
                                                            <div>
                                                                <p className="text-sm font-medium text-muted-foreground">Processor</p>
                                                                <Badge variant="outline" className="mt-1">
                                                                    {payment.processor}
                                                                </Badge>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    </div>
                                </section>

                                <Separator />

                                {/* Customer Information */}
                                {payment.userName || payment.userEmail ? (
                                    <section>
                                        <h3 className="text-lg font-semibold">Customer Information</h3>
                                        <div className="mt-4">
                                            <Card>
                                                <CardContent className="p-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                                                            <User className="h-5 w-5 text-primary" />
                                                        </div>
                                                        <div>
                                                            <p className="font-medium">{payment.userName || "Unknown"}</p>
                                                            {payment.userEmail && (
                                                                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                                                    <Mail className="h-3 w-3" />
                                                                    <span>{payment.userEmail}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        </div>
                                    </section>
                                ) : null}

                                <Separator />

                                {/* Raw JSON Data */}
                                <section>
                                    <Collapsible open={isJsonOpen} onOpenChange={setIsJsonOpen} className="w-full">
                                        <div className="flex items-center justify-end">
                                            <CollapsibleTrigger asChild>
                                                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground">
                                                    {isJsonOpen ? (
                                                        <>
                                                            <ChevronUp className="h-3 w-3 mr-1" />
                                                            <span>Raw JSON</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <ChevronDown className="h-3 w-3 mr-1" />
                                                            <span>Raw JSON</span>
                                                        </>
                                                    )}
                                                </Button>
                                            </CollapsibleTrigger>
                                        </div>
                                        <CollapsibleContent>
                                            <JsonViewer data={payment} className="mt-2" />
                                        </CollapsibleContent>
                                    </Collapsible>
                                </section>
                            </div>
                        </div>
                    </div>
                </ScrollArea>
                <DrawerFooter>
                    <DrawerClose asChild>
                        <Button variant="outline">Close</Button>
                    </DrawerClose>
                </DrawerFooter>
            </DrawerContent>
        </Drawer>
    );
};
