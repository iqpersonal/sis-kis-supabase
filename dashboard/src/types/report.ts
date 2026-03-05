export interface Report {
  id: string;
  date: string;
  category: string;
  region: string;
  revenue: number;
  units: number;
  profit: number;
  status: "completed" | "pending" | string;
}
