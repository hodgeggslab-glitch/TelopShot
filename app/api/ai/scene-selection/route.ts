import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type SceneSelectionPanel = {
  time: number;
  dataUrl: string;
};

type SceneSelectionSection = {
  peakTime: number;
  rangeStart: number;
  rangeEnd: number;
  panels: SceneSelectionPanel[];
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
    sections?: SceneSelectionSection[];
  };

  if (!body.sections?.length) {
    return NextResponse.json(
      { error: "解析対象のセクションがありません。" },
      { status: 400 }
    );
  }

  const prompt = [
    "あなたは日本のバラエティ動画から、盛り上がりシーンの紙芝居構成とショット提案を作る編集者です。",
    "与えられるのは、音量ピークを中心に切り出した3つの盛り上がり候補セクションです。",
    "各セクションには時系列順の5枚の静止画が含まれます。",
    "各セクションごとに、短いタイトル、1文の要約、5コマの紙芝居風ストーリー説明を日本語で返してください。",
    "各コマには短いタイトル、1文要約、構図の指示、15文字以内のテロップ案を返してください。",
    "誇張しすぎず、番組編集メモとして自然な表現にしてください。"
  ].join("\n");

  const responseSchema = {
    type: "OBJECT",
    properties: {
      sections: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            title: { type: "STRING" },
            summary: { type: "STRING" },
            panels: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  title: { type: "STRING" },
                  summary: { type: "STRING" },
                  shotDirection: { type: "STRING" },
                  recommendedTelop: { type: "STRING" }
                },
                required: ["title", "summary", "shotDirection", "recommendedTelop"]
              }
            }
          },
          required: ["title", "summary", "panels"]
        }
      }
    },
    required: ["sections"]
  };

  const parts: Array<Record<string, unknown>> = [
    { text: prompt }
  ];

  body.sections.forEach((section, sectionIndex) => {
    parts.push({
      text: `セクション${sectionIndex + 1}: ピーク時刻 ${section.peakTime.toFixed(2)}秒 / 解析範囲 ${section.rangeStart.toFixed(2)}秒〜${section.rangeEnd.toFixed(2)}秒`
    });
    section.panels.forEach((panel, panelIndex) => {
      parts.push({
        text: `セクション${sectionIndex + 1} コマ${panelIndex + 1} 候補時刻: ${panel.time.toFixed(2)}秒`
      });
      parts.push({
        inline_data: dataUrlToInlineData(panel.dataUrl)
      });
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
          temperature: 0.6,
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
    sections: Array<{
      title: string;
      summary: string;
      panels: Array<{
        title: string;
        summary: string;
        shotDirection: string;
        recommendedTelop: string;
      }>;
    }>;
  };

  return NextResponse.json({
    sections: body.sections.map((section, sectionIndex) => ({
      title: parsed.sections?.[sectionIndex]?.title ?? `シーン ${sectionIndex + 1}`,
      summary: parsed.sections?.[sectionIndex]?.summary ?? "",
      panels: section.panels.map((panel, panelIndex) => ({
        time: panel.time,
        title: parsed.sections?.[sectionIndex]?.panels?.[panelIndex]?.title ?? `コマ ${panelIndex + 1}`,
        summary: parsed.sections?.[sectionIndex]?.panels?.[panelIndex]?.summary ?? "",
        shotDirection:
          parsed.sections?.[sectionIndex]?.panels?.[panelIndex]?.shotDirection ?? "",
        recommendedTelop:
          parsed.sections?.[sectionIndex]?.panels?.[panelIndex]?.recommendedTelop ?? ""
      }))
    }))
  });
}
