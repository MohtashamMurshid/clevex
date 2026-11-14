import type { Metadata } from "next";
import { Dashboard } from "@/components/dashboard";

export const metadata: Metadata = { title: "Projects · clevex" };

export default function AppHome() {
  return <Dashboard />;
}
