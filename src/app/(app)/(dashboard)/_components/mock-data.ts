/**
 * Sample data for the dashboard demo components.
 *
 * These power the example dashboard widgets (`overview-tabs`, `recent-sales`,
 * `revenue-chart`) and are intentionally static — no data source is wired up.
 * Replace with real queries when the dashboard becomes a live surface.
 */

export interface Sale {
  id: string;
  name: string;
  email: string;
  amount: string;
  avatar: string;
  fallback: string;
}

export const sales: Sale[] = [
  {
    id: "1",
    name: "Olivia Martin",
    email: "olivia.martin@email.com",
    amount: "+$1,999.00",
    avatar: "/avatars/01.png",
    fallback: "OM",
  },
  {
    id: "2",
    name: "Jackson Lee",
    email: "jackson.lee@email.com",
    amount: "+$39.00",
    avatar: "/avatars/02.png",
    fallback: "JL",
  },
  {
    id: "3",
    name: "Isabella Nguyen",
    email: "isabella.nguyen@email.com",
    amount: "+$299.00",
    avatar: "/avatars/03.png",
    fallback: "IN",
  },
  {
    id: "4",
    name: "William Kim",
    email: "will@email.com",
    amount: "+$99.00",
    avatar: "/avatars/04.png",
    fallback: "WK",
  },
  {
    id: "5",
    name: "Sofia Davis",
    email: "sofia.davis@email.com",
    amount: "+$39.00",
    avatar: "/avatars/05.png",
    fallback: "SD",
  },
];

export type TeamMemberStatus = "Active" | "Invited" | "Inactive";

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  status: TeamMemberStatus;
  lastActive: string;
}

export const teamMembers: TeamMember[] = [
  { id: "1", name: "Olivia Martin", role: "Owner", status: "Active", lastActive: "2 hours ago" },
  { id: "2", name: "Jackson Lee", role: "Developer", status: "Active", lastActive: "5 hours ago" },
  { id: "3", name: "Isabella Nguyen", role: "Designer", status: "Invited", lastActive: "—" },
  { id: "4", name: "William Kim", role: "Developer", status: "Inactive", lastActive: "3 weeks ago" },
];

/** Maps a member status onto a Badge variant. */
export const statusVariant = (
  status: TeamMemberStatus
): "default" | "secondary" | "destructive" | "outline" => {
  switch (status) {
    case "Active":
      return "default";
    case "Invited":
      return "secondary";
    default:
      return "outline";
  }
};

export const revenueChartData = [
  { month: "January", revenue: 18600, expenses: 8000 },
  { month: "February", revenue: 30500, expenses: 12000 },
  { month: "March", revenue: 23700, expenses: 11000 },
  { month: "April", revenue: 27300, expenses: 14000 },
  { month: "May", revenue: 20900, expenses: 9500 },
  { month: "June", revenue: 34100, expenses: 15200 },
];

export const pageViewsData = [
  { month: "January", views: 12400 },
  { month: "February", views: 15800 },
  { month: "March", views: 14200 },
  { month: "April", views: 17600 },
  { month: "May", views: 16100 },
  { month: "June", views: 21300 },
];

export const bounceRateData = [
  { month: "January", rate: 48 },
  { month: "February", rate: 44 },
  { month: "March", rate: 46 },
  { month: "April", rate: 41 },
  { month: "May", rate: 39 },
  { month: "June", rate: 36 },
];
