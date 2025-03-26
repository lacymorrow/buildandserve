"use client";

import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { saveAs } from "file-saver";
import JSZip from "jszip";
import { useState } from "react";

export interface FileChange {
    path: string;
    content: string;
}

interface FileChangeDisplayProps {
    changedFiles: FileChange[];
    onDownloadAll: () => void;
}

export const FileChangeDisplay = ({ changedFiles, onDownloadAll }: FileChangeDisplayProps) => {
    const [selectedFile, setSelectedFile] = useState<FileChange | null>(null);

    const downloadSingleFile = (file: FileChange) => {
        const blob = new Blob([file.content], { type: "text/plain;charset=utf-8" });
        saveAs(blob, file.path.split("/").pop() || "file.txt");
    };

    const downloadAllFiles = async () => {
        try {
            const zip = new JSZip();

            // Add all changed files to the zip
            for (const file of changedFiles) {
                // Skip files that appear to be binary based on the content
                if (!file.content.includes("[Binary data:")) {
                    // Preserve directory structure
                    zip.file(file.path, file.content);
                }
            }

            // Generate the zip file
            const zipBlob = await zip.generateAsync({ type: "blob" });
            saveAs(zipBlob, "shadcn-changes.zip");
        } catch (error) {
            console.error("Error creating zip file:", error);
            alert("Failed to create zip file. See console for details.");
        }
    };

    return (
        <div className="w-full space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">
                    {changedFiles.length} file{changedFiles.length !== 1 ? "s" : ""} changed
                </h3>
                <Button onClick={downloadAllFiles} variant="default">
                    Download All Changes
                </Button>
            </div>

            <ScrollArea className="h-[400px] rounded-md border p-4">
                <Accordion type="single" collapsible className="w-full">
                    {changedFiles.map((file) => (
                        <AccordionItem key={file.path} value={file.path}>
                            <AccordionTrigger className="text-left">
                                <span className="font-mono text-sm">{file.path}</span>
                            </AccordionTrigger>
                            <AccordionContent>
                                <div className="flex justify-between mb-2">
                                    <Dialog>
                                        <DialogTrigger asChild>
                                            <Button variant="outline" size="sm" onClick={() => setSelectedFile(file)}>
                                                View Content
                                            </Button>
                                        </DialogTrigger>
                                        <DialogContent className="max-w-3xl">
                                            <DialogHeader>
                                                <DialogTitle className="font-mono">{selectedFile?.path}</DialogTitle>
                                            </DialogHeader>
                                            <ScrollArea className="h-[500px] w-full rounded-md border p-4">
                                                <pre className="text-sm font-mono whitespace-pre-wrap">
                                                    {selectedFile?.content}
                                                </pre>
                                            </ScrollArea>
                                        </DialogContent>
                                    </Dialog>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => downloadSingleFile(file)}
                                    >
                                        Download File
                                    </Button>
                                </div>
                                <div className="text-sm text-muted-foreground">
                                    {file.content.includes("[Binary data:")
                                        ? "Binary file"
                                        : `${file.content.length} characters`}
                                </div>
                            </AccordionContent>
                        </AccordionItem>
                    ))}
                </Accordion>
            </ScrollArea>
        </div>
    );
};
