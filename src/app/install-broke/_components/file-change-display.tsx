"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangleIcon, CheckIcon, CopyIcon, FileIcon, FolderIcon } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";

// Dynamically import syntax highlighting to avoid SSR issues
const SyntaxHighlighter = dynamic(
    () => import("react-syntax-highlighter").then((mod) => mod.default),
    { ssr: false }
);

// Dracula theme for syntax highlighting
const dracula = dynamic(
    () => import("react-syntax-highlighter/dist/cjs/styles/hljs/dracula").then((mod) => mod.default),
    { ssr: false }
);

export interface FileChange {
    path: string;
    content: string;
    isNew?: boolean;
}

interface FileChangeDisplayProps {
    files: FileChange[];
    onClose?: () => void;
}

export function FileChangeDisplay({ files, onClose }: FileChangeDisplayProps) {
    const [activeFile, setActiveFile] = useState<string>(files.length > 0 ? files[0].path : "");
    const [copied, setCopied] = useState<boolean>(false);

    // Find the selected file
    const selectedFile = files.find((file) => file.path === activeFile);

    // Count new files vs modified files
    const newFiles = files.filter((file) => file.isNew).length;
    const modifiedFiles = files.length - newFiles;

    // Function to get the file extension
    const getFileExtension = (filePath: string) => {
        const parts = filePath.split(".");
        return parts.length > 1 ? parts[parts.length - 1] : "";
    };

    // Function to determine the language for syntax highlighting
    const getLanguage = (filePath: string) => {
        const ext = getFileExtension(filePath);
        switch (ext) {
            case "ts":
            case "tsx":
                return "typescript";
            case "js":
            case "jsx":
                return "javascript";
            case "css":
                return "css";
            case "scss":
                return "scss";
            case "json":
                return "json";
            case "html":
                return "html";
            case "md":
                return "markdown";
            default:
                return "typescript"; // Default to typescript
        }
    };

    // Function to copy code to clipboard
    const copyToClipboard = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error("Failed to copy text: ", err);
        }
    };

    // If no files are provided, show a message
    if (files.length === 0) {
        return (
            <Alert>
                <AlertTriangleIcon className="h-4 w-4" />
                <AlertTitle>No files changed</AlertTitle>
                <AlertDescription>No files were changed during the installation process.</AlertDescription>
            </Alert>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="space-y-1">
                    <h3 className="font-semibold text-lg">Installation Complete</h3>
                    <p className="text-sm text-muted-foreground">
                        The following files were {newFiles > 0 && modifiedFiles > 0 ? "added or modified" : newFiles > 0 ? "added" : "modified"} during installation.
                    </p>
                </div>
                {onClose && (
                    <Button variant="outline" onClick={onClose}>
                        Close
                    </Button>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-1 space-y-4">
                    <Card>
                        <CardHeader className="py-3">
                            <CardTitle className="text-sm font-medium">Files</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <ul className="divide-y divide-border">
                                {files.map((file) => (
                                    <li key={file.path}>
                                        <button
                                            className={`w-full text-left px-3 py-2 text-sm flex items-center space-x-2 hover:bg-accent/50 ${activeFile === file.path ? "bg-accent" : ""
                                                }`}
                                            onClick={() => setActiveFile(file.path)}
                                        >
                                            {file.path.endsWith("/") ? (
                                                <FolderIcon className="h-4 w-4 text-muted-foreground" />
                                            ) : (
                                                <FileIcon className="h-4 w-4 text-muted-foreground" />
                                            )}
                                            <span className="flex-1 truncate">{file.path}</span>
                                            {file.isNew && (
                                                <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                                                    New
                                                </Badge>
                                            )}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </CardContent>
                    </Card>
                </div>

                <div className="lg:col-span-2">
                    <Card>
                        <CardHeader className="py-3 flex flex-row items-center justify-between">
                            <CardTitle className="text-sm font-medium">{selectedFile?.path}</CardTitle>
                            <Button variant="ghost" size="sm" onClick={() => copyToClipboard(selectedFile?.content || "")}>
                                {copied ? <CheckIcon className="h-4 w-4 text-green-500" /> : <CopyIcon className="h-4 w-4" />}
                                <span className="ml-2">{copied ? "Copied" : "Copy"}</span>
                            </Button>
                        </CardHeader>
                        <CardContent className="p-0 max-h-[400px] overflow-auto">
                            {selectedFile && (
                                <div className="text-sm">
                                    <SyntaxHighlighter
                                        language={getLanguage(selectedFile.path)}
                                        style={dracula}
                                        customStyle={{
                                            background: "transparent",
                                            padding: "16px",
                                            margin: 0,
                                            fontSize: "0.875rem",
                                        }}
                                    >
                                        {selectedFile.content}
                                    </SyntaxHighlighter>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
