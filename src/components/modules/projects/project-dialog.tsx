"use client";

export interface ProjectDialogProps {
  children?: React.ReactNode;
  /** Owner of the project being created or edited. */
  userId?: string;
  /** Which flow the dialog opens in. */
  variant?: "create" | "edit";
}

/**
 * Project dialog stub. Renders its trigger only; `userId` and `variant` are
 * accepted so call sites keep their contract until the real dialog lands.
 */
export function ProjectDialog({ children }: ProjectDialogProps) {
  return <>{children}</>;
}
