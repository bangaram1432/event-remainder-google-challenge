import { getDeps } from "@/server/container";
import { handleEnhanceRequest } from "@/server/plan-handler";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request): Promise<Response> {
  return handleEnhanceRequest(request, getDeps());
}
