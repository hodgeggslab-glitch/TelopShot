import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type ChatMessage = {
  role: "user" | "model";
  content: string;
};

export async function POST(request: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY が設定されていません。" },
      { status: 500 }
    );
  }

  const body = (await request.json()) as {
    message?: string;
    messages?: ChatMessage[];
  };

  const message = body.message?.trim();
  if (!message) {
    return NextResponse.json(
      { error: "コメントを入力してください。" },
      { status: 400 }
    );
  }

  const priorMessages = (body.messages ?? []).filter(
    (entry) => entry?.content?.trim() && (entry.role === "user" || entry.role === "model")
  );

  const contents = [
    {
      role: "user",
      parts: [
        {
          text:
            "あなたは TelopShot の Gemini 接続確認用アシスタントです。日本語で、短く自然に返答してください。"
        }
      ]
    },
    ...priorMessages.map((entry) => ({
      role: entry.role === "model" ? "model" : "user",
      parts: [{ text: entry.content }]
    })),
    {
      role: "user",
      parts: [{ text: message }]
    }
  ];

  const geminiResponse = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 300
        }
      })
    }
  );

  if (!geminiResponse.ok) {
    const errorText = await geminiResponse.text();
    return NextResponse.json(
      { error: `Gemini API エラー: ${errorText}` },
      { status: 500 }
    );
  }

  const geminiJson = await geminiResponse.json();
  const reply = geminiJson?.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text ?? "")
    .join("")
    .trim();

  if (!reply) {
    return NextResponse.json(
      { error: "Gemini から有効な返答を取得できませんでした。" },
      { status: 500 }
    );
  }

  return NextResponse.json({ reply });
}
