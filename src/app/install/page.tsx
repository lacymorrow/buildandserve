"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import JSZip from "jszip";
import { AlertTriangleIcon, DownloadIcon, ExternalLinkIcon, SettingsIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { getProjectStructure } from "./actions";
import { ContainerProcessor } from "./components/container-processor";
import { FilePreview } from "./components/file-preview";

export default function InstallPage() {
	const [processing, setProcessing] = useState(false);
	const [files, setFiles] = useState<{ path: string; content: string }[]>([]);
	const [projectStructure, setProjectStructure] = useState("src/app");
	const [error, setError] = useState<string | null>(null);
	const [activeTab, setActiveTab] = useState("input");
	const [webContainerSupported, setWebContainerSupported] = useState(false);
	const [showContainerProcessor, setShowContainerProcessor] = useState(false);
	const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
	const [processingMethod, setProcessingMethod] = useState<"webcontainer" | "manual">("webcontainer");
	const [isCrossOriginIsolated, setIsCrossOriginIsolated] = useState(false);

	// Check if WebContainer is supported and get project structure on load
	useEffect(() => {
		const initialize = async () => {
			// Check WebContainer support
			try {
				if (typeof window !== "undefined") {
					// Check if the page is cross-origin isolated
					setIsCrossOriginIsolated(!!window.crossOriginIsolated);

					// Basic check for features needed by WebContainers
					const isSupported =
						"serviceWorker" in navigator &&
						"SharedWorker" in window &&
						"Atomics" in window;

					// Only mark as supported if cross-origin isolated
					setWebContainerSupported(isSupported && window.crossOriginIsolated);

					// If not supported, default to manual option
					if (!isSupported || !window.crossOriginIsolated) {
						setProcessingMethod("manual");
					}
				}
			} catch (err) {
				console.error("Error checking WebContainer support:", err);
				setWebContainerSupported(false);
				setProcessingMethod("manual");
			}

			// Get project structure
			try {
				const structure = await getProjectStructure();
				setProjectStructure(structure);
			} catch (err) {
				console.error("Error getting project structure:", err);
			}
		};

		initialize();
	}, []);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		if (processingMethod === "webcontainer" && !webContainerSupported) {
			setError("WebContainers are not supported in this environment. Please use the manual option instead.");
			return;
		}

		setProcessing(true);
		setError(null);

		if (processingMethod === "webcontainer") {
			setShowContainerProcessor(true);
			// The container processor component will handle the rest
		} else {
			// Manual processing option - direct the user to shadcn.com
			window.open("https://ui.shadcn.com/docs/installation", '_blank');
			setError("Please follow the manual installation instructions from the shadcn.com website.");
			setProcessing(false);
		}
	};

	const handleContainerComplete = (processedFiles: { path: string; content: string }[]) => {
		setFiles(processedFiles);
		setActiveTab("preview");
		setProcessing(false);
		setShowContainerProcessor(false);
	};

	const handleContainerError = (errorMessage: string) => {
		setError(errorMessage);
		setProcessing(false);
		setShowContainerProcessor(false);
		// If error is related to cross-origin isolation, switch to manual
		if (errorMessage.includes("cross-origin") || errorMessage.includes("SharedArrayBuffer")) {
			setProcessingMethod("manual");
		}
	};

	const handleDownloadAll = () => {
		// Create a zip file with all components
		const zip = new JSZip();

		// Add each file to the zip
		for (const file of files) {
			zip.file(file.path, file.content);
		}

		// Generate the zip file and download it
		zip.generateAsync({ type: "blob" }).then((blob) => {
			const link = document.createElement("a");
			link.href = URL.createObjectURL(blob);
			link.download = "v0-component.zip";
			link.click();
			URL.revokeObjectURL(link.href);
		});
	};

	return (
		<div className="container py-10 max-w-4xl">
			<div className="mb-8">
				<h1 className="text-3xl font-bold mb-4">shadcn/UI Templates</h1>
				<p className="text-gray-500">
					Install the shadcn/UI components template using a virtual container. This will generate all the necessary components, styles, and configuration files.
				</p>
			</div>

			<Tabs defaultValue="input" value={activeTab} onValueChange={setActiveTab}>
				<TabsList className="mb-4">
					<TabsTrigger value="input">Setup</TabsTrigger>
					<TabsTrigger value="preview" disabled={files.length === 0}>
						Preview
					</TabsTrigger>
				</TabsList>
				<TabsContent value="input">
					<Card>
						<CardHeader>
							<CardTitle>Install shadcn/UI Template</CardTitle>
							<CardDescription>
								Use our WebContainer technology to install the shadcn/UI template without leaving the browser.
							</CardDescription>
						</CardHeader>
						<CardContent>
							{error && (
								<Alert variant="destructive" className="mb-4">
									<AlertTriangleIcon className="h-4 w-4" />
									<AlertTitle>Error</AlertTitle>
									<AlertDescription>{error}</AlertDescription>
								</Alert>
							)}

							{!webContainerSupported && (
								<Alert variant="warning" className="mb-4">
									<AlertTriangleIcon className="h-4 w-4" />
									<AlertTitle>WebContainer Not Supported</AlertTitle>
									<AlertDescription>
										{isCrossOriginIsolated ? (
											"Your browser doesn't support the features needed for WebContainers. Please use the manual installation method."
										) : (
											"Cross-Origin Isolation is not enabled. WebContainers require a cross-origin isolated environment."
										)}
									</AlertDescription>
								</Alert>
							)}

							<div className="space-y-4">
								<div>
									<div className="flex justify-between items-center mb-2">
										<Label htmlFor="processing-method">Processing Method</Label>
										<Button
											variant="ghost"
											size="sm"
											className="h-8 px-2 text-xs"
											onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
										>
											<SettingsIcon className="h-3.5 w-3.5 mr-1" />
											{showAdvancedOptions ? "Hide Options" : "Show Options"}
										</Button>
									</div>

									<RadioGroup
										id="processing-method"
										defaultValue="webcontainer"
										value={processingMethod}
										onValueChange={(value) => setProcessingMethod(value as "webcontainer" | "manual")}
										className="flex flex-col space-y-2"
									>
										<div className="flex items-center space-x-2">
											<RadioGroupItem
												value="webcontainer"
												id="webcontainer"
												disabled={!webContainerSupported}
											/>
											<Label htmlFor="webcontainer">
												WebContainer (in-browser installation)
											</Label>
										</div>
										<div className="flex items-center space-x-2">
											<RadioGroupItem value="manual" id="manual" />
											<Label htmlFor="manual">Manual Installation (instructions)</Label>
										</div>
									</RadioGroup>
								</div>

								{showAdvancedOptions && (
									<div>
										<Label htmlFor="project-structure">Project Structure</Label>
										<RadioGroup
											id="project-structure"
											defaultValue="src/app"
											value={projectStructure}
											onValueChange={setProjectStructure}
											className="flex flex-col space-y-2 mt-2"
										>
											<div className="flex items-center space-x-2">
												<RadioGroupItem value="src/app" id="src-app" />
												<Label htmlFor="src-app">src/app (default)</Label>
											</div>
											<div className="flex items-center space-x-2">
												<RadioGroupItem value="app" id="app" />
												<Label htmlFor="app">app (no src folder)</Label>
											</div>
										</RadioGroup>
									</div>
								)}
							</div>
						</CardContent>
						<CardFooter className="flex justify-between">
							<Button
								type="submit"
								onClick={handleSubmit}
								disabled={processing || (processingMethod === "webcontainer" && !webContainerSupported)}
							>
								{processing ? "Processing..." : "Install Template"}
							</Button>
							<Button variant="outline" asChild>
								<a href="https://ui.shadcn.com" target="_blank" rel="noopener noreferrer">
									shadcn/UI Docs <ExternalLinkIcon className="ml-2 h-4 w-4" />
								</a>
							</Button>
						</CardFooter>
					</Card>

					{showContainerProcessor && (
						<div className="mt-4">
							<ContainerProcessor
								projectStructure={projectStructure}
								onComplete={handleContainerComplete}
								onError={handleContainerError}
							/>
						</div>
					)}
				</TabsContent>

				<TabsContent value="preview">
					<Card>
						<CardHeader>
							<CardTitle>Component Files</CardTitle>
							<CardDescription>
								These files will be created in your project using the{" "}
								<code className="text-xs bg-muted px-1 py-0.5 rounded">{projectStructure}</code>{" "}
								directory structure
							</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="space-y-4">
								{files.length === 0 ? (
									<p className="text-muted-foreground">No files to display</p>
								) : (
									files.map((file) => <FilePreview key={file.path} file={file} />)
								)}
							</div>
						</CardContent>
						<CardFooter className="flex justify-between">
							<Button variant="outline" onClick={() => setActiveTab("input")}>
								Back to Input
							</Button>
							<Button onClick={handleDownloadAll} disabled={files.length === 0}>
								<DownloadIcon className="mr-2 h-4 w-4" />
								Download All Files
							</Button>
						</CardFooter>
					</Card>
				</TabsContent>
			</Tabs>
		</div>
	);
}
