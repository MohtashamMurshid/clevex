import { redirect } from "next/navigation";
import { ConvexClientProvider } from "@/components/convex-provider";
import { getToken } from "@/lib/auth-server";

/** Everything under (app) needs a signed-in user; data comes from Convex. */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const token = await getToken();
  if (!token) redirect("/sign-in");
  return <ConvexClientProvider initialToken={token}>{children}</ConvexClientProvider>;
}
