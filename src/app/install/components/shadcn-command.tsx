"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileIcon, InfoIcon } from "lucide-react";
import { useState } from "react";
import { containerManager } from "../container-utils";
import { type FileChange, FileChangeDisplay } from "./file-change-display";

export const ShadcnCommand = () => {
    const [isLoading, setIsLoading] = useState(false);
    const [command, setCommand] = useState("");
    const [commandOutput, setCommandOutput] = useState<string>("");
    const [commandError, setCommandError] = useState<string>("");
    const [changedFiles, setChangedFiles] = useState<FileChange[]>([]);
    const [activeTab, setActiveTab] = useState("command");
    const [progressMessage, setProgressMessage] = useState("");

    // Function to update progress message based on logs
    const updateProgress = (logs: string) => {
        if (logs.includes("Installing dependencies")) {
            setProgressMessage("Installing dependencies... This may take several minutes");
        } else if (logs.includes("installing") && !logs.includes("Installing dependencies")) {
            setProgressMessage("Installing components... Please wait");
        } else if (logs.includes("ready to use") || logs.includes("component added")) {
            setProgressMessage("Component added successfully!");
        } else if (logs.includes("copying")) {
            setProgressMessage("Copying component files...");
        } else if (logs.includes("validating")) {
            setProgressMessage("Validating configuration...");
        } else if (logs.includes("added ") && logs.includes("package")) {
            setProgressMessage("Added dependencies successfully!");
        } else if (logs.includes("downloading") || logs.includes("fetching")) {
            setProgressMessage("Downloading packages... Please wait");
        }
    };

    // Validate the command format - just basic checks
    const validateCommand = (commandStr: string): string | null => {
        // No real validation needed - we'll let the command run as-is
        if (!commandStr.trim()) {
            return "Please enter a command";
        }
        return null;
    };

    const runCommand = async () => {
        setIsLoading(true);
        setCommandOutput("");
        setCommandError("");
        setChangedFiles([]);
        setProgressMessage("Starting command execution...");
        setActiveTab("command");

        // Simple validation to ensure there's a command
        const validationError = validateCommand(command);
        if (validationError) {
            setCommandError(validationError);
            setIsLoading(false);
            return;
        }

        try {
            // Parse the command into arguments
            const args = command.trim().split(/\s+/);

            // Track the window logs before running the command
            const logsBefore = window.webContainerLogs ? [...window.webContainerLogs] : [];

            // Set up an interval to update UI with latest logs during execution
            const logUpdateInterval = setInterval(() => {
                if (window.webContainerLogs) {
                    const currentLogs = window.webContainerLogs.slice(logsBefore.length);
                    const formattedLogs = currentLogs
                        .map((log) => `[${log.timestamp}] ${log.message} ${log.data || ""}`)
                        .join("\n");

                    setCommandOutput(formattedLogs || "Command running...");
                    updateProgress(formattedLogs);
                }
            }, 1000);

            // Run the command and get changed files
            const changes = await containerManager?.runShadcnCommand(args);

            // Clear the interval when done
            clearInterval(logUpdateInterval);

            // Get logs that were added during command execution
            const logsAfter = window.webContainerLogs ? [...window.webContainerLogs] : [];
            const newLogs = logsAfter.slice(logsBefore.length);

            // Format logs for display
            const formattedLogs = newLogs
                .map((log) => `[${log.timestamp}] ${log.message} ${log.data || ""}`)
                .join("\n");

            setCommandOutput(formattedLogs || "Command completed successfully");
            setProgressMessage("");

            if (changes && changes.length > 0) {
                setChangedFiles(changes);
                setActiveTab("files");
            } else {
                setActiveTab("command");
            }
        } catch (error) {
            setCommandError(error instanceof Error ? error.message : String(error));
            setProgressMessage("");
            setActiveTab("command");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="container mx-auto p-4 space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Run Shadcn/UI Command</CardTitle>
                    <CardDescription>
                        Run any shadcn command to add components and track changes
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="command">Command</Label>
                        <div className="flex gap-2">
                            <Input
                                id="command"
                                placeholder="npx shadcn@latest add button"
                                value={command}
                                onChange={(e) => setCommand(e.target.value)}
                                disabled={isLoading}
                            />
                            <Button onClick={runCommand} disabled={isLoading || !command.trim()}>
                                {isLoading ? "Running..." : "Run"}
                            </Button>
                        </div>

                        {isLoading && progressMessage && (
                            <div className="mt-2 flex items-center text-sm">
                                <div className="animate-spin mr-2 h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                                <span>{progressMessage}</span>
                            </div>
                        )}

                        <div className="text-sm text-muted-foreground space-y-2 mt-2">
                            <p><strong>Examples:</strong></p>
                            <ul className="list-disc pl-5 space-y-1">
                                <li>"npx shadcn@latest <strong>--yes</strong> add button" - Install button component</li>
                                <li>"npx shadcn@latest <strong>--yes</strong> add card dialog" - Install multiple components</li>
                                <li>"npx shadcn@latest <strong>--yes</strong> add https://v0.dev/chat/..." - Install from v0.dev URL</li>
                                <li>"bunx shadcn-ui@latest <strong>--yes</strong> add dropdown-menu" - Use other package managers</li>
                            </ul>
                            <Alert className="mt-2">
                                <AlertTitle className="text-xs font-semibold">Pro Tips</AlertTitle>
                                <AlertDescription className="text-xs">
                                    <ul className="list-disc pl-4 mt-1 space-y-1">
                                        <li>Add <strong>--yes</strong> to auto-confirm installations</li>
                                        <li>For v0.dev URLs, make sure they're properly quoted: "https://v0.dev/..."</li>
                                        <li>Paste commands exactly as you would run them in your terminal</li>
                                        <li>Complex components may take several minutes to install</li>
                                    </ul>
                                </AlertDescription>
                            </Alert>
                        </div>
                    </div>

                    {commandError && (
                        <Alert variant="destructive">
                            <AlertTitle>Error</AlertTitle>
                            <AlertDescription>
                                <pre className="mt-2 w-full whitespace-pre-wrap font-mono text-sm">
                                    {commandError}
                                </pre>
                            </AlertDescription>
                        </Alert>
                    )}

                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="command">
                                <InfoIcon className="h-4 w-4 mr-2" />
                                Command Output
                            </TabsTrigger>
                            <TabsTrigger value="files" disabled={changedFiles.length === 0}>
                                <FileIcon className="h-4 w-4 mr-2" />
                                Changed Files {changedFiles.length > 0 && `(${changedFiles.length})`}
                            </TabsTrigger>
                        </TabsList>
                        <TabsContent value="command" className="mt-4">
                            {commandOutput ? (
                                <div className="bg-muted p-4 rounded-md">
                                    <pre className="whitespace-pre-wrap font-mono text-sm">{commandOutput}</pre>
                                </div>
                            ) : (
                                <div className="text-center p-8 text-muted-foreground">
                                    Run a command to see output
                                </div>
                            )}
                        </TabsContent>
                        <TabsContent value="files" className="mt-4">
                            {changedFiles.length > 0 ? (
                                <FileChangeDisplay
                                    changedFiles={changedFiles}
                                    onDownloadAll={() => { }} // This is handled in the component itself
                                />
                            ) : (
                                <div className="text-center p-8 text-muted-foreground">
                                    No files changed by the command
                                </div>
                            )}
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>
        </div>
    );
};
