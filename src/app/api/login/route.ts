import { COOKIE, gateToken } from "@/proxy";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const password = process.env.CLEVEX_PASSWORD;
  if (!password) return Response.json({ ok: true });
  const body = (await req.json().catch(() => ({}))) as { password?: string };
  if (body.password !== password) {
    await new Promise((r) => setTimeout(r, 600));
    return Response.json({ ok: false, error: "Wrong password" }, { status: 401 });
  }
  const token = await gateToken(password);
  const secure = new URL(req.url).protocol === "https:";
  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      "content-type": "application/json",
      "set-cookie": `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 90}${secure ? "; Secure" : ""}`,
    },
  });
}
