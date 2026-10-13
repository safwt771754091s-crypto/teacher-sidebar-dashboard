import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const openAiKey = Deno.env.get("OPENAI_API_KEY");
  if (!url || !anonKey) return json(503, { error: "supabase_not_configured" });
  if (!openAiKey) return json(503, { error: "ai_provider_not_configured" });

  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return json(401, { error: "authentication_required" });

  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError || !authData.user) return json(401, { error: "invalid_session" });

  let payload: { question?: unknown; grade_level?: unknown };
  try { payload = await req.json(); } catch { return json(400, { error: "invalid_json" }); }
  const question = typeof payload.question === "string" ? payload.question.trim() : "";
  const grade = Number(payload.grade_level);
  if (!question || question.length > 1500) return json(400, { error: "question_required_or_too_long" });
  const gradeLevel = Number.isInteger(grade) && grade >= 1 && grade <= 12 ? grade : null;

  let lessonQuery = client.from("curriculum_lessons")
    .select("id,grade_level,subject_name,unit_title,lesson_title,lesson_content,source_book,source_edition,page_start,page_end")
    .eq("published", true).eq("review_status", "approved").limit(60);
  if (gradeLevel !== null) lessonQuery = lessonQuery.eq("grade_level", gradeLevel);
  const { data: lessons, error: lessonError } = await lessonQuery;
  if (lessonError) return json(500, { error: "curriculum_lookup_failed" });

  const tokens = question.toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u).filter((token) => token.length > 2);
  const ranked = (lessons ?? []).map((lesson) => {
    const haystack = [lesson.subject_name, lesson.unit_title ?? "", lesson.lesson_title, lesson.lesson_content]
      .join(" ").toLocaleLowerCase();
    const score = tokens.reduce((sum, token) => sum + (haystack.includes(token) ? 1 : 0), 0);
    return { lesson, score };
  }).sort((a, b) => b.score - a.score).filter((item) => item.score > 0).slice(0, 5);

  const sources = ranked.map(({ lesson }, index) => ({
    index: index + 1,
    title: lesson.lesson_title,
    subject: lesson.subject_name,
    book: lesson.source_book,
    edition: lesson.source_edition,
    page_start: lesson.page_start,
    page_end: lesson.page_end,
    excerpt: String(lesson.lesson_content ?? "").slice(0, 5000),
  }));
  const systemPrompt = [
    "أنت المعلّم صفوت، مساعد تعليمي لطالب في اليمن.",
    "أجب بالعربية الواضحة وبما يناسب عمر الطالب وصفه، واشرح الفكرة خطوة بخطوة بدل إعطاء النتيجة فقط.",
    "المصادر المرفقة هي محتوى كتب تمت مراجعته واعتماده. عند الإجابة عن سؤال يخص المنهج، استشهد بالمصدر برقم [1] أو [2] عند الاستفادة منه.",
    "لا تخترع أرقام صفحات أو تنسب أي معلومة إلى كتاب غير موجود في المصادر.",
    "إذا لم تتضمن المصادر إجابة موثوقة، صرّح بذلك بوضوح، ويمكنك تقديم شرح عام مع تمييزه بأنه شرح إضافي وليس اقتباسًا من الكتاب.",
    "إذا كان السؤال غامضًا، اطلب توضيحًا. لا تطلب من الطالب معلومات شخصية حساسة.",
  ].join("\n");
  const userPrompt = JSON.stringify({
    grade_level: gradeLevel,
    question,
    approved_curriculum_sources: sources.map(({ index, title, subject, book, edition, page_start, page_end, excerpt }) => ({
      index, title, subject, book, edition, page_start, page_end, excerpt,
    })),
  });

  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${openAiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini",
        temperature: 0.3,
        max_tokens: 900,
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
      }),
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    return json(502, { error: "ai_provider_unreachable" });
  }
  if (!response.ok) return json(502, { error: "ai_provider_request_failed" });
  const result = await response.json();
  const answer = result?.choices?.[0]?.message?.content;
  if (typeof answer !== "string" || !answer.trim()) return json(502, { error: "empty_ai_response" });
  return json(200, {
    answer,
    sources: sources.map(({ index, title, subject, book, edition, page_start, page_end }) => ({
      index, title, subject, book, edition, page_start, page_end,
    })),
  });
});
