import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type VideoSummaryFrame = {
  time: number;
  dataUrl: string;
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
    videoName?: string;
    frames?: VideoSummaryFrame[];
  };

  if (!body.frames?.length) {
    return NextResponse.json(
      { error: "要約対象のフレームがありません。" },
      { status: 400 }
    );
  }

  const responseSchema = {
    type: "OBJECT",
    properties: {
      sections: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            time: { type: "NUMBER" },
            title: { type: "STRING" },
            summary: { type: "STRING" }
          },
          required: ["time", "title", "summary"]
        }
      }
    },
    required: ["sections"]
  };

  const parts: Array<Record<string, unknown>> = [
    {
      text: [
        "あなたは日本の動画編集者です。",
        "与えられる静止画フレームは、1本の動画を時系列順にサンプリングしたものです。",
        "各フレームの時刻を手がかりに、動画全体の流れを日本語でわかりやすく要約してください。",
        "結果は最大6項目の時系列リストで返してください。",
        "各項目には、代表時刻、短いタイトル、1〜2文の要約を含めてください。",
        "誇張しすぎず、編集メモとして自然な表現にしてください。",
        `動画名: ${body.videoName ?? "不明"}`
      ].join("\n")
    }
  ];

  body.frames.forEach((frame, index) => {
    parts.push({
      text: `フレーム ${index + 1} / 時刻 ${frame.time.toFixed(2)} 秒`
    });
    parts.push({
      inline_data: dataUrlToInlineData(frame.dataUrl)
    });
  });

  const geminiResponse = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts
          }
        ],
        generationConfig: {
          temperature: 0.5,
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
    sections?: Array<{
      time: number;
      title: string;
      summary: string;
    }>;
  };

  return NextResponse.json({
    sections: (parsed.sections ?? []).slice(0, 6)
  });
}
