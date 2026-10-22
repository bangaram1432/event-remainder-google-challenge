import { getDeps } from "@/server/container";
import { handlePlanRequest } from "@/server/plan-handler";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return handlePlanRequest(request, getDeps());
}
