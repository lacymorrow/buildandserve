"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useSynchronizedSession } from "@/hooks/use-synchronized-session";

export const SessionStatus = () => {
    const { session, isLoading, isPayloadAuthenticated, refreshSession, validatePayloadToken } = useSynchronizedSession();

    return (
        <Card className="w-full max-w-md mx-auto">
            <CardHeader>
                <CardTitle>Session Status</CardTitle>
                <CardDescription>Current authentication status across systems</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {isLoading ? (
                    <div className="flex items-center justify-center h-20">
                        <p className="text-muted-foreground">Loading session information...</p>
                    </div>
                ) : (
                    <>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="font-medium">NextAuth Session:</span>
                                <Badge variant={session ? "default" : "destructive"}>
                                    {session ? "Authenticated" : "Not Authenticated"}
                                </Badge>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="font-medium">Payload CMS:</span>
                                <Badge variant={isPayloadAuthenticated ? "default" : "destructive"}>
                                    {isPayloadAuthenticated ? "Authenticated" : "Not Authenticated"}
                                </Badge>
                            </div>
                        </div>

                        {session && (
                            <div className="space-y-2 pt-2 border-t">
                                <p className="text-sm font-medium">User Information:</p>
                                <div className="text-sm">
                                    <p><span className="font-medium">Name:</span> {session.user?.name || "N/A"}</p>
                                    <p><span className="font-medium">Email:</span> {session.user?.email || "N/A"}</p>
                                    <p><span className="font-medium">Payload Token:</span> {session.user?.payloadToken ? "Present" : "Missing"}</p>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </CardContent>
            <CardFooter className="flex justify-between">
                <Button variant="outline" onClick={() => validatePayloadToken()}>
                    Validate Payload Token
                </Button>
                <Button onClick={() => refreshSession()}>
                    Refresh Session
                </Button>
            </CardFooter>
        </Card>
    );
};
