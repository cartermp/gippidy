export function GET() {
  return Response.json({
    openai:    !!process.env.OPENAI_API_KEY,
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    google:    !!process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  });
}
