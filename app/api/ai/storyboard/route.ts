import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type StoryboardRequestPanel = {
  time: number;
  dataUrl: string;
};

type StoryboardResponsePanel = {
  time: number;
  title: string;
  summary: string;
  shotDirection: string;
  recommendedTelop: string;
};

type StoryboardResponse = {
  title: string;
  summary: string;
  panels: StoryboardResponsePanel[];
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
    peakTime: number;
    rangeStart: number;
    rangeEnd: number;
    panels: StoryboardRequestPanel[];
  };

  if (!body?.panels?.length) {
    return NextResponse.json(
      { error: "解析対象のフレームがありません。" },
      { status: 400 }
    );
  }

  const responseSchema = {
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
  };

  const parts: Array<Record<string, unknown>> = [
    {
      text: [
        "あなたは日本のバラエティ動画から、紙芝居風の構成を考える編集者です。",
        "与えられた静止画は、音量ピークの前後2分から抜き出した時系列順のフレームです。",
        "このフレーム列をもとに、場面の流れが伝わる紙芝居構成を日本語で要約してください。",
        "各コマについて、短いタイトル、1文の要約、欲しいショットの構図指示、テロップ案を返してください。",
        "",
        "【テロップ案のルール】",
        "・演者の口の動き・表情・身振りから、実際に発している言葉をできる限り忠実に読み取ってください。",
        "・読み取れた発話をそのままテロップにしてください。要約や意訳ではなく、生のセリフ感を最優先します。",
        "・発話が読み取れない場合のみ、表情やリアクションから心の声を推測してください。",
        "・文字数は25文字以内を目安にしますが、面白さや臨場感が伝わるなら多少超えてもOKです。",
        "・ナレーション調・客観説明調は禁止。「〜している」「〜の様子」のような表現は使わないでください。",
        "・5枚通して読んだとき、会話の流れや笑いのテンポが伝わるようにしてください。",
        "",
        `ピーク時刻: ${body.peakTime.toFixed(2)}秒`,
        `解析範囲: ${body.rangeStart.toFixed(2)}秒〜${body.rangeEnd.toFixed(2)}秒`
      ].join("\n")
    }
  ];

  body.panels.forEach((panel, index) => {
    parts.push({
      text: `コマ${index + 1} 候補時刻: ${panel.time.toFixed(2)}秒`
    });
    parts.push({
      inline_data: dataUrlToInlineData(panel.dataUrl)
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

  const parsed = JSON.parse(text) as StoryboardResponse;
  const panels = body.panels.map((panel, index) => ({
    time: panel.time,
    title: parsed.panels[index]?.title ?? `コマ ${index + 1}`,
    summary: parsed.panels[index]?.summary ?? "",
    shotDirection: parsed.panels[index]?.shotDirection ?? "",
    recommendedTelop: parsed.panels[index]?.recommendedTelop ?? ""
  }));

  return NextResponse.json({
    title: parsed.title,
    summary: parsed.summary,
    panels
  });
}
