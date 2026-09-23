import { documentError, DocumentError } from "@/lib/server/document-store";
import { AiError } from "@/lib/server/openai-json";
import { extractionJobs } from "@/lib/server/extraction-jobs";
import { toCanonicalOrganization } from "@/lib/canonical-organization";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
type Context = { params: Promise<{ id: string }> };
function sameOrigin(request: Request) {
  const origin=request.headers.get("origin");
  if(origin && new URL(origin).host!==request.headers.get("host")) throw new DocumentError("Недопустимый источник запроса.",403);
}
export async function GET(request: Request, context: Context) {
  try {
    const {id}=await context.params;
    const status=await extractionJobs.status(id);
    const params=new URL(request.url).searchParams;
    if(params.has("status")) return Response.json(status,{headers:{"Cache-Control":"no-store"}});
    if(!("result" in status)) throw new DocumentError(status.error || "AI-извлечение ещё не выполнено.",404);
    const payload=params.get("view")==="canonical" ? toCanonicalOrganization([status.result],status.result.side) : {result:status.result};
    return Response.json(payload,{headers:{"Cache-Control":"no-store",...(params.has("download") ? {"Content-Disposition":'attachment; filename="organization.json"'} : {})}});
  } catch(error) {return documentError(error instanceof AiError ? new DocumentError(error.message,error.status) : error);}
}
export async function POST(request: Request, context: Context) {
  try {
    sameOrigin(request);
    const {id}=await context.params;
    // Check the existing result/job before requiring a key or starting paid work.
    const status=await extractionJobs.status(id);
    if("result" in status) return Response.json({result:status.result,cached:true});
    if(status.status!=="running" && !process.env.OPENAI_API_KEY?.trim()) throw new DocumentError("На сервере не задан OPENAI_API_KEY.",503);
    const started=await extractionJobs.start(id);
    if(started.cached) return Response.json({result:started.result,cached:true});
    if(new URL(request.url).searchParams.has("background")) return Response.json(started.job.state,{status:202,headers:{"Cache-Control":"no-store"}});
    // Backwards-compatible synchronous API for scripts and existing callers.
    await started.job.promise;
    if(!started.job.result) throw new DocumentError(started.job.state.error || "Извлечение не выполнено.",started.job.errorStatus);
    return Response.json({result:started.job.result,cached:false});
  } catch(error) {return documentError(error instanceof AiError ? new DocumentError(error.message,error.status) : error);}
}
export async function DELETE(request: Request, context: Context) {
  try {sameOrigin(request);const {id}=await context.params;return Response.json(await extractionJobs.cancel(id));}
  catch(error) {return documentError(error instanceof AiError ? new DocumentError(error.message,error.status) : error);}
}
