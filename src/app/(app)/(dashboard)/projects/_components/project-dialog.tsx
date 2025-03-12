"use client";

import { useTeam } from "@/components/providers/team-provider";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { createProject, updateProject } from "@/server/actions/projects";
import { createTeam, getUserTeams } from "@/server/actions/teams";
import { zodResolver } from "@hookform/resolvers/zod";
import { type VariantProps, cva } from "class-variance-authority";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const projectDialogVariants = cva("", {
	variants: {
		variant: {
			default: "",
			withTeamCreation: "",
		},
	},
	defaultVariants: {
		variant: "default",
	},
});

interface Team {
	team: {
		id: string;
		name: string;
		createdAt?: Date;
		updatedAt?: Date | null;
	};
	role: string;
}

interface Project {
	id: string;
	name: string;
	teamId?: string;
}

const formSchema = z.object({
	name: z.string().min(1, "Project name is required"),
	teamId: z.string().min(1, "Team is required"),
});

interface ProjectDialogProps extends VariantProps<typeof projectDialogVariants> {
	userId: string;
	children?: React.ReactNode;
	className?: string;
	mode?: "create" | "edit";
	project?: Project;
}

/**
 * Unified project dialog component that can be used for both creating and editing projects,
 * with an optional ability to create a new team.
 *
 * @param variant - "default" for basic project creation, "withTeamCreation" to enable team creation
 * @param userId - The ID of the current user
 * @param children - Optional trigger element
 * @param className - Optional additional classes
 * @param mode - "create" (default) or "edit" mode
 * @param project - The project to edit (required when mode is "edit")
 */
export function ProjectDialog({
	variant = "default",
	userId,
	children,
	className,
	mode = "create",
	project,
}: ProjectDialogProps) {
	const { toast } = useToast();
	const router = useRouter();
	const [isOpen, setIsOpen] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [teams, setTeams] = useState<Team[]>([]);
	const [defaultTeamId, setDefaultTeamId] = useState<string>("");
	const { selectedTeamId } = useTeam();

	// Team creation specific state (only used when variant is "withTeamCreation")
	const [showNewTeamInput, setShowNewTeamInput] = useState(false);
	const [newTeamName, setNewTeamName] = useState("");

	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			name: mode === "edit" && project ? project.name : "",
			teamId: mode === "edit" && project?.teamId
				? project.teamId
				: selectedTeamId || defaultTeamId || "",
		},
	});

	// Update form values when project changes in edit mode
	useEffect(() => {
		if (mode === "edit" && project) {
			form.setValue("name", project.name);
			if (project.teamId) {
				form.setValue("teamId", project.teamId);
			}
		}
	}, [form, mode, project]);

	// Load teams when dialog opens
	useEffect(() => {
		const loadTeams = async () => {
			try {
				const userTeams = await getUserTeams(userId);
				setTeams(userTeams);

				// Set default team ID if teams are available
				if (userTeams.length > 0) {
					const firstTeamId = userTeams[0].team.id;
					setDefaultTeamId(firstTeamId);

					// Set form value if not already set and in create mode
					if (mode === "create" && !form.getValues("teamId")) {
						// Prioritize selectedTeamId from context if available
						form.setValue("teamId", selectedTeamId || firstTeamId);
					}
				}
			} catch (error) {
				console.error("Failed to load teams:", error);
				toast({
					title: "Error",
					description: "Failed to load teams. Please try again.",
					variant: "destructive",
				});
			}
		};

		if (isOpen) {
			loadTeams();
		}
	}, [isOpen, userId, selectedTeamId, form, toast, mode]);

	// Handle team creation (only for withTeamCreation variant)
	const handleCreateTeam = async () => {
		if (!newTeamName) return;
		setIsLoading(true);
		try {
			const team = await createTeam(newTeamName, userId);
			form.setValue("teamId", team.id);
			setShowNewTeamInput(false);
			setNewTeamName("");

			// Refresh teams list
			const userTeams = await getUserTeams(userId);
			setTeams(userTeams);

			toast({
				title: "Success",
				description: `Team "${newTeamName}" has been created.`,
			});
		} catch (error) {
			console.error("Failed to create team:", error);
			toast({
				title: "Error",
				description: "Failed to create team. Please try again.",
				variant: "destructive",
			});
		} finally {
			setIsLoading(false);
		}
	};

	// Handle form submission (create or update project)
	const onSubmit = async (values: z.infer<typeof formSchema>) => {
		setIsLoading(true);
		try {
			if (mode === "create") {
				await createProject(values.name, values.teamId, userId);
				toast({
					title: "Success",
					description: `Project "${values.name}" has been created.`,
				});
			} else if (mode === "edit" && project) {
				await updateProject(project.id, values.name);
				toast({
					title: "Success",
					description: `Project "${values.name}" has been updated.`,
				});
			}
			setIsOpen(false);
			form.reset();
			router.refresh();
		} catch (error) {
			console.error(`Failed to ${mode} project:`, error);
			toast({
				title: "Error",
				description: `Failed to ${mode} project. Please try again.`,
				variant: "destructive",
			});
		} finally {
			setIsLoading(false);
		}
	};

	// Determine dialog title and button text based on mode
	const dialogTitle = mode === "create" ? "Create Project" : "Edit Project";
	const dialogDescription = mode === "create"
		? "Create a new project to organize your work."
		: "Update your project details.";
	const submitButtonText = isLoading
		? (mode === "create" ? "Creating..." : "Updating...")
		: (mode === "create" ? "Create Project" : "Update Project");

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				{children ? (
					<div>{children}</div>
				) : (
					<Button>
						<Plus className="mr-2 h-4 w-4" />
						{mode === "create" ? "Create Project" : "Edit Project"}
					</Button>
				)}
			</DialogTrigger>
			<DialogContent className={cn(projectDialogVariants({ variant }), className)}>
				<DialogHeader>
					<DialogTitle>{dialogTitle}</DialogTitle>
					<DialogDescription>
						{dialogDescription}
					</DialogDescription>
				</DialogHeader>
				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Project Name</FormLabel>
									<FormControl>
										<Input
											placeholder="Project name"
											{...field}
											autoComplete="off"
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						{/* Only show team selection in create mode */}
						{mode === "create" && (
							variant === "withTeamCreation" && showNewTeamInput ? (
								<div className="space-y-2">
									<FormLabel>New Team Name</FormLabel>
									<div className="flex gap-2">
										<Input
											placeholder="My Team"
											value={newTeamName}
											onChange={(e) => setNewTeamName(e.target.value)}
										/>
										<Button
											type="button"
											onClick={handleCreateTeam}
											disabled={!newTeamName || isLoading}
										>
											Create Team
										</Button>
									</div>
									<Button
										type="button"
										variant="ghost"
										onClick={() => setShowNewTeamInput(false)}
									>
										Cancel
									</Button>
								</div>
							) : (
								<FormField
									control={form.control}
									name="teamId"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Team</FormLabel>
											<Select
												onValueChange={field.onChange}
												defaultValue={field.value}
											>
												<FormControl>
													<SelectTrigger>
														<SelectValue placeholder="Select a team" />
													</SelectTrigger>
												</FormControl>
												<SelectContent>
													{variant === "withTeamCreation" && (
														<Button
															type="button"
															variant="ghost"
															className="w-full justify-start"
															onClick={() => setShowNewTeamInput(true)}
														>
															<Plus className="mr-2 h-4 w-4" />
															Create New Team
														</Button>
													)}
													{teams.map(({ team }) => (
														<SelectItem key={team.id} value={team.id}>
															{team.name}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
											<FormMessage />
										</FormItem>
									)}
								/>
							)
						)}

						<DialogFooter>
							<Button type="submit" disabled={isLoading}>
								{submitButtonText}
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
