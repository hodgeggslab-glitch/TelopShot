import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type ShotFilterFrame = {
  id: string;
  dataUrl: string;
};

type ShotFilterResult = {
  id: string;
  hasTelop: boolean;
  personCount: number; // 0, 1, 2, 3+ → 3 means "more"
};

function dataUrlToInlineData(dataUrl: string) {
  const match = dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!match) {
    throw new Error("画像データの形式が不正です。");
  }
  return {
    mime_type: match[1],
    data: match[2]
  };
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY が設定されていません。" },
      { status: 500 }
    );
  }

  const body = (await request.json()) as {
    frames?: ShotFilterFrame[];
  };

  if (!body.frames?.length) {
    return NextResponse.json(
      { error: "解析対象のフレームがありません。" },
      { status: 400 }
    );
  }

  const responseSchema = {
    type: "OBJECT",
    properties: {
      results: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            index: { type: "NUMBER" },
            hasTelop: { type: "BOOLEAN" },
            personCount: { type: "NUMBER" }
          },
          required: ["index", "hasTelop", "personCount"]
        }
      }
    },
    required: ["results"]
  };

  const parts: Array<Record<string, unknown>> = [
    {
      text: [
        "あなたは画像分析の専門家です。与えられた画像それぞれについて以下を判定してください。",
        "",
        "【テロップの有無 (hasTelop)】",
        "画像の下半分にテロップ（字幕テキスト、テキストオーバーレイ）があるかどうかを判定してください。",
        "番組名やロゴではなく、発言内容や説明を示すテロップが対象です。",
        "true = テロップあり、false = テロップなし",
        "",
        "【人物の数 (personCount)】",
        "画像内に映っている人物の数を判定してください。",
        "0 = 人物なし、1 = 1人、2 = 2人、3 = 3人以上",
        "",
        "各画像のインデックス（0始まり）と結果をresults配列で返してください。"
      ].join("\n")
    }
  ];

  body.frames.forEach((frame, index) => {
    parts.push({ text: `画像 ${index}:` });
    parts.push({ inline_data: dataUrlToInlineData(frame.dataUrl) });
  });

  const geminiResponse = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
          responseSchema
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
  const text = geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    return NextResponse.json(
      { error: "Gemini から有効な応答を取得できませんでした。" },
      { status: 500 }
    );
  }

  const parsed = JSON.parse(text) as {
    results: Array<{ index: number; hasTelop: boolean; personCount: number }>;
  };

  const results: ShotFilterResult[] = body.frames.map((frame, i) => {
    const r = parsed.results?.find((x) => x.index === i);
    return {
      id: frame.id,
      hasTelop: r?.hasTelop ?? false,
      personCount: Math.min(r?.personCount ?? 0, 3)
    };
  });

  return NextResponse.json({ results });
}
