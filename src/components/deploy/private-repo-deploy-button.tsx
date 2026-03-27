"use client";

import { AlertCircle, CheckCircle, Clock, ExternalLink, Github } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
<<<<<<< HEAD:src/components/deploy/private-repo-deploy-button.tsx
import { Textarea } from "@/components/ui/textarea";
||||||| bac2439d:src/components/modules/deploy/private-repo-deploy-button.tsx
import { siteConfig } from "@/config/site-config";
import { cn } from "@/lib/utils";
=======
import { routes } from "@/config/routes";
import { siteConfig } from "@/config/site-config";
import { cn } from "@/lib/utils";
>>>>>>> upstream/main:src/components/modules/deploy/private-repo-deploy-button.tsx
import { deployPrivateRepository } from "@/server/actions/deploy-private-repo";

interface DeploymentStatus {
  step:
    | "idle"
    | "validating"
    | "creating-repo"
    | "creating-vercel"
    | "deploying"
    | "completed"
    | "error";
  message?: string;
  githubRepo?: {
    url: string;
    name: string;
  };
  vercelProject?: {
    projectUrl: string;
    deploymentUrl?: string;
  };
  error?: string;
}

export const PrivateRepoDeployButton = () => {
<<<<<<< HEAD:src/components/deploy/private-repo-deploy-button.tsx
	const [formData, setFormData] = useState({
		templateRepo: "",
		projectName: "",
		description: "",
		githubToken: "",
	});
	const [status, setStatus] = useState<DeploymentStatus>({ step: "idle" });
	const [isDeploying, setIsDeploying] = useState(false);
||||||| bac2439d:src/components/modules/deploy/private-repo-deploy-button.tsx
	const [formData, setFormData] = useState({
		projectName: "",
		description: "",
	});
	const [status, setStatus] = useState<DeploymentStatus>({ step: "idle" });
	const [isDeploying, setIsDeploying] = useState(false);
	const [needsGitHubAuth, setNeedsGitHubAuth] = useState(false);

	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter" && !isDeploying) {
			e.preventDefault();
			handleDeploy();
		}
	};
=======
  const [formData, setFormData] = useState({
    projectName: "",
    description: "",
  });
  const [status, setStatus] = useState<DeploymentStatus>({ step: "idle" });
  const [isDeploying, setIsDeploying] = useState(false);
  const [needsGitHubAuth, setNeedsGitHubAuth] = useState(false);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !isDeploying) {
      e.preventDefault();
      handleDeploy();
    }
  };
>>>>>>> upstream/main:src/components/modules/deploy/private-repo-deploy-button.tsx

<<<<<<< HEAD:src/components/deploy/private-repo-deploy-button.tsx
	const handleDeploy = async () => {
		if (!formData.templateRepo || !formData.projectName || !formData.githubToken) {
			toast.error("Please fill in all required fields");
			return;
		}
||||||| bac2439d:src/components/modules/deploy/private-repo-deploy-button.tsx
	const handleDeploy = async () => {
		if (!formData.projectName) {
			toast.error("Please enter a project name");
			return;
		}
=======
  const handleDeploy = async () => {
    if (!formData.projectName) {
      toast.error("Please enter a project name");
      return;
    }
>>>>>>> upstream/main:src/components/modules/deploy/private-repo-deploy-button.tsx

    setIsDeploying(true);
    setStatus({ step: "validating", message: "Validating configuration..." });

<<<<<<< HEAD:src/components/deploy/private-repo-deploy-button.tsx
		try {
			const result = await deployPrivateRepository({
				templateRepo: formData.templateRepo,
				projectName: formData.projectName,
				description: formData.description,
				githubToken: formData.githubToken,
				newRepoName: formData.projectName,
			});
||||||| bac2439d:src/components/modules/deploy/private-repo-deploy-button.tsx
		try {
			const result = await deployPrivateRepository({
				templateRepo: SHIPKIT_REPO,
				projectName: formData.projectName,
				description: formData.description || `Deployed from ${SHIPKIT_REPO}`,
			});
=======
    try {
      const result = await deployPrivateRepository({
        templateRepo: SHIPKIT_REPO,
        projectName: formData.projectName,
        description: formData.description || `Deployed from ${SHIPKIT_REPO}`,
      });
>>>>>>> upstream/main:src/components/modules/deploy/private-repo-deploy-button.tsx

<<<<<<< HEAD:src/components/deploy/private-repo-deploy-button.tsx
			if (result.success && result.data) {
				setStatus({
					step: "completed",
					message: result.message,
					githubRepo: result.data.githubRepo,
					vercelProject: result.data.vercelProject,
				});
				toast.success("Deployment completed successfully!");
			} else {
				setStatus({
					step: "error",
					error: result.error || "Deployment failed",
				});
				toast.error(result.error || "Deployment failed");
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
			setStatus({
				step: "error",
				error: errorMessage,
			});
			toast.error(errorMessage);
		} finally {
			setIsDeploying(false);
		}
	};
||||||| bac2439d:src/components/modules/deploy/private-repo-deploy-button.tsx
			if (result.success && result.data) {
				setStatus({
					step: "completed",
					message: result.message,
					githubRepo: result.data.githubRepo,
					vercelProject: result.data.vercelProject,
				});
				toast.success("Deployment completed successfully!");
			} else {
				// Check if the error is related to GitHub authentication
				if (result.error?.includes("GitHub account not connected")) {
					setNeedsGitHubAuth(true);
				}
				setStatus({
					step: "error",
					error: result.error || "Deployment failed",
					githubRepo: result.data?.githubRepo, // Keep the GitHub repo info if available
				});

				// If manual import is required and we have a GitHub repo, open Vercel import
				if (result.data?.requiresManualImport && result.data?.githubRepo?.url) {
					toast.info("Opening Vercel import page...");
					const importUrl = `https://vercel.com/new/import?s=${encodeURIComponent(
						result.data.githubRepo.url
					)}`;
					window.open(importUrl, "_blank", "noopener,noreferrer");
				} else {
					toast.error(result.error || "Deployment failed");
				}
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
			setStatus({
				step: "error",
				error: errorMessage,
			});
			toast.error(errorMessage);
		} finally {
			setIsDeploying(false);
		}
	};
=======
      if (result.success && result.data) {
        setStatus({
          step: "completed",
          message: result.message,
          githubRepo: result.data.githubRepo,
          vercelProject: result.data.vercelProject,
        });
        toast.success("Deployment completed successfully!");
      } else {
        // Check if the error is related to GitHub authentication
        if (result.error?.includes("GitHub account not connected")) {
          setNeedsGitHubAuth(true);
        }
        setStatus({
          step: "error",
          error: result.error || "Deployment failed",
          githubRepo: result.data?.githubRepo, // Keep the GitHub repo info if available
        });

        // If manual import is required and we have a GitHub repo, open Vercel import
        if (result.data?.requiresManualImport && result.data?.githubRepo?.url) {
          toast.info("Opening Vercel import page...");
          const importUrl = `https://vercel.com/new/import?s=${encodeURIComponent(
            result.data.githubRepo.url
          )}`;
          window.open(importUrl, "_blank", "noopener,noreferrer");
        } else {
          toast.error(result.error || "Deployment failed");
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
      setStatus({
        step: "error",
        error: errorMessage,
      });
      toast.error(errorMessage);
    } finally {
      setIsDeploying(false);
    }
  };
>>>>>>> upstream/main:src/components/modules/deploy/private-repo-deploy-button.tsx

<<<<<<< HEAD:src/components/deploy/private-repo-deploy-button.tsx
	const resetForm = () => {
		setStatus({ step: "idle" });
		setFormData({
			templateRepo: "",
			projectName: "",
			description: "",
			githubToken: "",
		});
	};
||||||| bac2439d:src/components/modules/deploy/private-repo-deploy-button.tsx
	const resetForm = () => {
		setStatus({ step: "idle" });
		setFormData({
			projectName: "",
			description: "",
		});
		setNeedsGitHubAuth(false);
	};
=======
  const resetForm = () => {
    setStatus({ step: "idle" });
    setFormData({
      projectName: "",
      description: "",
    });
    setNeedsGitHubAuth(false);
  };
>>>>>>> upstream/main:src/components/modules/deploy/private-repo-deploy-button.tsx

  const getStatusIcon = () => {
    switch (status.step) {
      case "completed":
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case "error":
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      case "idle":
        return null;
      default:
        return <Clock className="h-5 w-5 text-blue-500 animate-spin" />;
    }
  };

  const getStatusBadgeVariant = () => {
    switch (status.step) {
      case "completed":
        return "default" as const;
      case "error":
        return "destructive" as const;
      case "idle":
        return "secondary" as const;
      default:
        return "outline" as const;
    }
  };

<<<<<<< HEAD:src/components/deploy/private-repo-deploy-button.tsx
	return (
		<Card className="w-full max-w-2xl mx-auto">
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Github className="h-5 w-5" />
					Deploy Private Repository
				</CardTitle>
				<CardDescription>
					Deploy a private GitHub repository template to your GitHub and Vercel accounts. Make sure
					you have connected your Vercel account in Settings first.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-6">
				{/* Status Display */}
				{status.step !== "idle" && (
					<Alert>
						<div className="flex items-center gap-2">
							{getStatusIcon()}
							<Badge variant={getStatusBadgeVariant()}>
								{status.step.replace("-", " ").toUpperCase()}
							</Badge>
						</div>
						<AlertDescription className="mt-2">{status.message || status.error}</AlertDescription>
					</Alert>
				)}
||||||| bac2439d:src/components/modules/deploy/private-repo-deploy-button.tsx
	return (
		<Card className="w-full max-w-2xl mx-auto">
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Github className="h-5 w-5" />
					Deploy Shipkit
				</CardTitle>
				<CardDescription>
					Deploy your own instance of Shipkit to GitHub and Vercel. Make sure you have connected
					both your GitHub and Vercel accounts in Settings first.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-6">
				{/* Status Display */}
				{status.step !== "idle" && (
					<Alert>
						<div className="flex items-center gap-2">
							{getStatusIcon()}
							<Badge variant={getStatusBadgeVariant()}>
								{status.step.replace("-", " ").toUpperCase()}
							</Badge>
						</div>
						<AlertDescription className="mt-2">
							{status.message || status.error}
							{needsGitHubAuth && (
								<div className="mt-3">
									<LinkWithTransition
										href="/settings/accounts"
										className={cn(
											buttonVariants({ variant: "default", size: "sm" }),
											"inline-flex items-center gap-2"
										)}
									>
										<Github className="h-4 w-4" />
										Connect GitHub Account
									</LinkWithTransition>
								</div>
							)}
							{status.step === "error" && status.githubRepo && (
								<div className="mt-3 space-y-2">
									<p className="text-sm">
										✅ GitHub repository created:{" "}
										<span className="font-mono text-xs">{status.githubRepo?.name}</span>
									</p>
									<p className="text-sm">
										The Vercel import page should have opened in a new tab. If it didn't, click
										below:
									</p>
									<Button
										variant="default"
										size="sm"
										onClick={() => {
											const importUrl = `https://vercel.com/new/import?s=${encodeURIComponent(
												status.githubRepo?.url || ""
											)}`;
											window.open(importUrl, "_blank", "noopener,noreferrer");
										}}
										className="inline-flex items-center gap-2"
									>
										<ExternalLink className="h-4 w-4" />
										Open Vercel Import
									</Button>
								</div>
							)}
						</AlertDescription>
					</Alert>
				)}
=======
  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Github className="h-5 w-5" />
          Deploy Shipkit
        </CardTitle>
        <CardDescription>
          Deploy your own instance of Shipkit to GitHub and Vercel. Make sure you have connected
          both your GitHub and Vercel accounts in Settings first.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Status Display */}
        {status.step !== "idle" && (
          <Alert>
            <div className="flex items-center gap-2">
              {getStatusIcon()}
              <Badge variant={getStatusBadgeVariant()}>
                {status.step.replace("-", " ").toUpperCase()}
              </Badge>
            </div>
            <AlertDescription className="mt-2">
              {status.message || status.error}
              {needsGitHubAuth && (
                <div className="mt-3">
                  <LinkWithTransition
                    href={routes.settings.account}
                    className={cn(
                      buttonVariants({ variant: "default", size: "sm" }),
                      "inline-flex items-center gap-2"
                    )}
                  >
                    <Github className="h-4 w-4" />
                    Connect GitHub Account
                  </LinkWithTransition>
                </div>
              )}
              {status.step === "error" && status.githubRepo && (
                <div className="mt-3 space-y-2">
                  <p className="text-sm">
                    ✅ GitHub repository created:{" "}
                    <span className="font-mono text-xs">{status.githubRepo?.name}</span>
                  </p>
                  <p className="text-sm">
                    The Vercel import page should have opened in a new tab. If it didn't, click
                    below:
                  </p>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => {
                      const importUrl = `https://vercel.com/new/import?s=${encodeURIComponent(
                        status.githubRepo?.url || ""
                      )}`;
                      window.open(importUrl, "_blank", "noopener,noreferrer");
                    }}
                    className="inline-flex items-center gap-2"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open Vercel Import
                  </Button>
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}
>>>>>>> upstream/main:src/components/modules/deploy/private-repo-deploy-button.tsx

        {/* Success Results */}
        {status.step === "completed" && status.githubRepo && status.vercelProject && (
          <div className="space-y-4">
            <Separator />
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">GitHub Repository</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{status.githubRepo.name}</span>
                    <Button variant="ghost" size="sm" asChild>
                      <a
                        href={status.githubRepo.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1"
                      >
                        <ExternalLink className="h-3 w-3" />
                        View
                      </a>
                    </Button>
                  </div>
                </CardContent>
              </Card>

<<<<<<< HEAD:src/components/deploy/private-repo-deploy-button.tsx
							<Card>
								<CardHeader className="pb-3">
									<CardTitle className="text-sm font-medium">Vercel Project</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="flex items-center justify-between">
										<span className="text-sm text-muted-foreground">Dashboard</span>
										<Button variant="ghost" size="sm" asChild>
											<a
												href={status.vercelProject.projectUrl}
												target="_blank"
												rel="noopener noreferrer"
												className="flex items-center gap-1"
											>
												<ExternalLink className="h-3 w-3" />
												View
											</a>
										</Button>
									</div>
									{status.vercelProject.deploymentUrl && (
										<div className="flex items-center justify-between mt-2">
											<span className="text-sm text-muted-foreground">Live Site</span>
											<Button variant="ghost" size="sm" asChild>
												<a
													href={status.vercelProject.deploymentUrl}
													target="_blank"
													rel="noopener noreferrer"
													className="flex items-center gap-1"
												>
													<ExternalLink className="h-3 w-3" />
													Visit
												</a>
											</Button>
										</div>
									)}
								</CardContent>
							</Card>
						</div>
						<Button onClick={resetForm} variant="outline" className="w-full">
							Deploy Another Repository
						</Button>
					</div>
				)}
||||||| bac2439d:src/components/modules/deploy/private-repo-deploy-button.tsx
							<Card>
								<CardHeader className="pb-3">
									<CardTitle className="text-sm font-medium">Vercel Project</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="flex items-center justify-between">
										<span className="text-sm text-muted-foreground">Dashboard</span>
										<Button variant="ghost" size="sm" asChild>
											<a
												href={status.vercelProject.projectUrl}
												target="_blank"
												rel="noopener noreferrer"
												className="flex items-center gap-1"
											>
												<ExternalLink className="h-3 w-3" />
												View
											</a>
										</Button>
									</div>
									{status.vercelProject.deploymentUrl && (
										<div className="flex items-center justify-between mt-2">
											<span className="text-sm text-muted-foreground">Live Site</span>
											<Button variant="ghost" size="sm" asChild>
												<a
													href={status.vercelProject.deploymentUrl}
													target="_blank"
													rel="noopener noreferrer"
													className="flex items-center gap-1"
												>
													<ExternalLink className="h-3 w-3" />
													Visit
												</a>
											</Button>
										</div>
									)}
								</CardContent>
							</Card>
						</div>
						<Button onClick={resetForm} variant="outline" className="w-full">
							Deploy Another Instance
						</Button>
					</div>
				)}
=======
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Vercel Project</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Dashboard</span>
                    <Button variant="ghost" size="sm" asChild>
                      <a
                        href={status.vercelProject.projectUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1"
                      >
                        <ExternalLink className="h-3 w-3" />
                        View
                      </a>
                    </Button>
                  </div>
                  {status.vercelProject.deploymentUrl && (
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-sm text-muted-foreground">Live Site</span>
                      <Button variant="ghost" size="sm" asChild>
                        <a
                          href={status.vercelProject.deploymentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Visit
                        </a>
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
            <Button onClick={resetForm} variant="outline" className="w-full">
              Deploy Another Instance
            </Button>
          </div>
        )}
>>>>>>> upstream/main:src/components/modules/deploy/private-repo-deploy-button.tsx

<<<<<<< HEAD:src/components/deploy/private-repo-deploy-button.tsx
				{/* Form */}
				{status.step === "idle" && (
					<div className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="templateRepo">Template Repository *</Label>
							<Input
								id="templateRepo"
								placeholder="owner/repository-name"
								value={formData.templateRepo}
								onChange={(e) => setFormData({ ...formData, templateRepo: e.target.value })}
							/>
							<p className="text-xs text-muted-foreground">
								The private repository you want to deploy (e.g., "myorg/private-template")
							</p>
						</div>
||||||| bac2439d:src/components/modules/deploy/private-repo-deploy-button.tsx
				{/* Form - Show on idle or error states */}
				{(status.step === "idle" || status.step === "error") && (
					<div className="space-y-4">
						<Alert>
							<Github className="h-4 w-4" />
							<AlertDescription>
								This will create a copy of the Shipkit repository ({SHIPKIT_REPO}) in your GitHub
								account and deploy it to Vercel.
							</AlertDescription>
						</Alert>
=======
        {/* Form - Show on idle or error states */}
        {(status.step === "idle" || status.step === "error") && (
          <div className="space-y-4">
            <Alert>
              <Github className="h-4 w-4" />
              <AlertDescription>
                This will create a copy of the Shipkit repository ({SHIPKIT_REPO}) in your GitHub
                account and deploy it to Vercel.
              </AlertDescription>
            </Alert>
>>>>>>> upstream/main:src/components/modules/deploy/private-repo-deploy-button.tsx

<<<<<<< HEAD:src/components/deploy/private-repo-deploy-button.tsx
						<div className="space-y-2">
							<Label htmlFor="projectName">Project Name *</Label>
							<Input
								id="projectName"
								placeholder="my-awesome-project"
								value={formData.projectName}
								onChange={(e) => setFormData({ ...formData, projectName: e.target.value })}
							/>
							<p className="text-xs text-muted-foreground">
								Name for the new repository and Vercel project (lowercase, numbers, hyphens only)
							</p>
						</div>
||||||| bac2439d:src/components/modules/deploy/private-repo-deploy-button.tsx
						<div className="space-y-2">
							<Label htmlFor="projectName">Project Name *</Label>
							<Input
								id="projectName"
								placeholder="my-shipkit-instance"
								value={formData.projectName}
								onChange={(e) => setFormData({ ...formData, projectName: e.target.value })}
								onKeyDown={handleKeyDown}
							/>
							<p className="text-xs text-muted-foreground">
								Name for your Shipkit instance (lowercase, numbers, hyphens only)
							</p>
						</div>
=======
            <div className="space-y-2">
              <Label htmlFor="projectName">Project Name *</Label>
              <Input
                id="projectName"
                placeholder="my-shipkit-instance"
                value={formData.projectName}
                onChange={(e) => setFormData({ ...formData, projectName: e.target.value })}
                onKeyDown={handleKeyDown}
              />
              <p className="text-xs text-muted-foreground">
                Name for your Shipkit instance (lowercase, numbers, hyphens only)
              </p>
            </div>
>>>>>>> upstream/main:src/components/modules/deploy/private-repo-deploy-button.tsx

<<<<<<< HEAD:src/components/deploy/private-repo-deploy-button.tsx
						<div className="space-y-2">
							<Label htmlFor="description">Description</Label>
							<Textarea
								id="description"
								placeholder="A brief description of your project"
								value={formData.description}
								onChange={(e) => setFormData({ ...formData, description: e.target.value })}
								rows={3}
							/>
						</div>
||||||| bac2439d:src/components/modules/deploy/private-repo-deploy-button.tsx
						<div className="space-y-2">
							<Label htmlFor="description">Description</Label>
							<Input
								id="description"
								placeholder="My custom Shipkit deployment"
								value={formData.description}
								onChange={(e) => setFormData({ ...formData, description: e.target.value })}
								onKeyDown={handleKeyDown}
							/>
						</div>
=======
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                placeholder="My custom Shipkit deployment"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                onKeyDown={handleKeyDown}
              />
            </div>
>>>>>>> upstream/main:src/components/modules/deploy/private-repo-deploy-button.tsx

<<<<<<< HEAD:src/components/deploy/private-repo-deploy-button.tsx
						<div className="space-y-2">
							<Label htmlFor="githubToken">GitHub Access Token *</Label>
							<Input
								id="githubToken"
								type="password"
								placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
								value={formData.githubToken}
								onChange={(e) => setFormData({ ...formData, githubToken: e.target.value })}
							/>
							<p className="text-xs text-muted-foreground">
								Personal access token with repo permissions.
								<a
									href="https://github.com/settings/tokens"
									target="_blank"
									rel="noopener noreferrer"
									className="text-blue-500 hover:underline ml-1"
								>
									Create one here
								</a>
							</p>
						</div>

						<Button onClick={handleDeploy} disabled={isDeploying} className="w-full">
							{isDeploying ? "Deploying..." : "Deploy Repository"}
						</Button>
					</div>
				)}
			</CardContent>
		</Card>
	);
||||||| bac2439d:src/components/modules/deploy/private-repo-deploy-button.tsx
						<div className="pt-4 space-y-3">
							<Button onClick={handleDeploy} disabled={isDeploying} className="w-full">
								{isDeploying ? "Deploying..." : "Deploy Shipkit"}
							</Button>
							<p className="text-xs text-center text-muted-foreground">
								Make sure you've connected your GitHub and Vercel accounts in{" "}
								<LinkWithTransition
									href="/settings/accounts"
									className="text-primary hover:underline"
								>
									Settings
								</LinkWithTransition>{" "}
								first.
							</p>
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	);
=======
            <div className="pt-4 space-y-3">
              <Button onClick={handleDeploy} disabled={isDeploying} className="w-full">
                {isDeploying ? "Deploying..." : "Deploy Shipkit"}
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                Make sure you've connected your GitHub and Vercel accounts in{" "}
                <LinkWithTransition
                  href={routes.settings.account}
                  className="text-primary hover:underline"
                >
                  Settings
                </LinkWithTransition>{" "}
                first.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
>>>>>>> upstream/main:src/components/modules/deploy/private-repo-deploy-button.tsx
};
