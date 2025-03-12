"use client";

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { VercelDeployButton } from "@/components/ui/vercel-deploy-button";
import { useState } from "react";

export default function VercelDeployExample() {
    const [selectedProject, setSelectedProject] = useState<string | undefined>(undefined);

    // This would typically come from your database
    const mockProjects = [
        { id: "project-1", name: "Marketing Website" },
        { id: "project-2", name: "E-commerce Store" },
        { id: "project-3", name: "Blog Platform" },
    ];

    return (
        <div className="container py-10">
            <h1 className="text-3xl font-bold mb-2">Vercel Deployment Example</h1>
            <p className="text-muted-foreground mb-8">
                This example demonstrates how to use the Vercel deploy button component.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <Card>
                    <CardHeader>
                        <CardTitle>Deploy a Project</CardTitle>
                        <CardDescription>
                            Select a project to deploy to Vercel
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label htmlFor="project-select" className="text-sm font-medium">
                                    Project
                                </label>
                                <Select
                                    value={selectedProject}
                                    onValueChange={setSelectedProject}
                                >
                                    <SelectTrigger id="project-select">
                                        <SelectValue placeholder="Select a project" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {mockProjects.map((project) => (
                                            <SelectItem key={project.id} value={project.id}>
                                                {project.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {selectedProject && (
                                <div className="p-4 bg-muted rounded-md">
                                    <p className="font-medium">
                                        Selected Project: {mockProjects.find(p => p.id === selectedProject)?.name}
                                    </p>
                                    <p className="text-sm text-muted-foreground mt-1">
                                        Project ID: {selectedProject}
                                    </p>
                                </div>
                            )}
                        </div>
                    </CardContent>
                    <CardFooter>
                        <VercelDeployButton projectId={selectedProject} />
                    </CardFooter>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>How It Works</CardTitle>
                        <CardDescription>
                            Understanding the Vercel deployment flow
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <h3 className="font-medium">1. Connect Your Account</h3>
                            <p className="text-sm text-muted-foreground">
                                If you haven't connected your Vercel account, the button will prompt you to connect first.
                            </p>
                        </div>

                        <Separator />

                        <div>
                            <h3 className="font-medium">2. Select a Project</h3>
                            <p className="text-sm text-muted-foreground">
                                Choose which project you want to deploy from the dropdown menu.
                            </p>
                        </div>

                        <Separator />

                        <div>
                            <h3 className="font-medium">3. Deploy</h3>
                            <p className="text-sm text-muted-foreground">
                                Click the "Deploy to Vercel" button to start the deployment process.
                            </p>
                        </div>

                        <Separator />

                        <div>
                            <h3 className="font-medium">4. Monitor</h3>
                            <p className="text-sm text-muted-foreground">
                                After deployment is initiated, you'll be redirected to the Vercel dashboard to monitor progress.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
