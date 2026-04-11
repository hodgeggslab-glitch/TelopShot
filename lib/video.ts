import { createTelopItem, defaultTelop } from "@/lib/telop";
import { HighlightConditions, ScreenshotCandidate, TelopItem, TelopStyle } from "@/lib/types";
import { clamp } from "@/lib/utils";

type SampleFrame = {
  time: number;
  score: number;
  fingerprint: Uint8ClampedArray;
  dataUrl: string;
  width: number;
  height: number;
  brightness: number;
  saturation: number;
  contrast: number;
  faceCount: number | null;
  textDensity: number;
  hasText: boolean;
};

type DetectResult = {
  brightness: number;
  saturation: number;
  contrast: number;
  faceCount: number | null;
  textDensity: number;
  hasText: boolean;
};

function createVideo(url: string) {
  return new Promise<HTMLVideoElement>((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "auto";
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.src = url;
    video.onloadedmetadata = () => resolve(video);
    video.onerror = () => reject(new Error("動画の読み込みに失敗しました"));
  });
}

function seek(video: HTMLVideoElement, time: number) {
  return new Promise<void>((resolve, reject) => {
    const handleSeeked = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error("動画のシークに失敗しました"));
    };
    const cleanup = () => {
      video.removeEventListener("seeked", handleSeeked);
      video.removeEventListener("error", handleError);
    };
    video.addEventListener("seeked", handleSeeked, { once: true });
    video.addEventListener("error", handleError, { once: true });
    video.currentTime = time;
  });
}

function captureFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  outputWidth = 960
) {
  const ratio = video.videoWidth / video.videoHeight;
  canvas.width = outputWidth;
  canvas.height = Math.round(outputWidth / ratio);
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.9);

  const sampleCanvas = document.createElement("canvas");
  sampleCanvas.width = 32;
  sampleCanvas.height = 18;
  const sampleCtx = sampleCanvas.getContext("2d");
  if (!sampleCtx) {
    throw new Error("サンプル用キャンバスの初期化に失敗しました");
  }
  sampleCtx.drawImage(video, 0, 0, sampleCanvas.width, sampleCanvas.height);
  const pixels = sampleCtx.getImageData(
    0,
    0,
    sampleCanvas.width,
    sampleCanvas.height
  ).data;
  return {
    dataUrl,
    width: canvas.width,
    height: canvas.height,
    fingerprint: pixels
  };
}

function diffScore(a: Uint8ClampedArray, b: Uint8ClampedArray) {
  let total = 0;
  for (let i = 0; i < a.length; i += 4) {
    const da =
      a[i] * 0.3 + a[i + 1] * 0.59 + a[i + 2] * 0.11 - (b[i] * 0.3 + b[i + 1] * 0.59 + b[i + 2] * 0.11);
    total += Math.abs(da);
  }
  return total / (a.length / 4);
}

async function detectFaceCount(canvas: HTMLCanvasElement) {
  const FaceDetectorCtor = (
    globalThis as unknown as {
      FaceDetector?: new (options?: {
        fastMode?: boolean;
        maxDetectedFaces?: number;
      }) => {
        detect: (input: CanvasImageSource) => Promise<Array<unknown>>;
      };
    }
  ).FaceDetector;

  if (!FaceDetectorCtor) return null;

  try {
    const detector = new FaceDetectorCtor({
      fastMode: true,
      maxDetectedFaces: 8
    });
    const faces = await detector.detect(canvas);
    return faces.length;
  } catch {
    return null;
  }
}

function detectTextDensity(
  video: HTMLVideoElement,
  startRatio = 0.12,
  endRatio = 0.9
) {
  const scanCanvas = document.createElement("canvas");
  scanCanvas.width = 96;
  scanCanvas.height = 54;
  const scanContext = scanCanvas.getContext("2d", { willReadFrequently: true });
  if (!scanContext) {
    return 0;
  }

  scanContext.drawImage(video, 0, 0, scanCanvas.width, scanCanvas.height);
  const { data, width, height } = scanContext.getImageData(0, 0, scanCanvas.width, scanCanvas.height);

  let contrastPixels = 0;
  let transitionRows = 0;
  const startRow = Math.floor(height * startRatio);
  const endRow = Math.floor(height * endRatio);

  for (let y = startRow; y < endRow; y += 1) {
    let rowTransitions = 0;
    let previousBand = -1;

    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const luminance =
        data[index] * 0.2126 +
        data[index + 1] * 0.7152 +
        data[index + 2] * 0.0722;
      const band = luminance > 184 ? 2 : luminance < 78 ? 0 : 1;
      if (band !== 1) {
        contrastPixels += 1;
      }
      if (previousBand !== -1 && band !== previousBand) {
        rowTransitions += 1;
      }
      previousBand = band;
    }

    if (rowTransitions >= width * 0.22) {
      transitionRows += 1;
    }
  }

  const totalPixels = width * (endRow - startRow);
  const contrastRatio = totalPixels ? contrastPixels / totalPixels : 0;
  const transitionRatio = endRow - startRow ? transitionRows / (endRow - startRow) : 0;
  return contrastRatio * 0.6 + transitionRatio * 0.4;
}

function detectLikelyTelop(
  video: HTMLVideoElement
) {
  return detectTextDensity(video, 0.52, 0.9) > 0.28;
}

function detectVisualMetrics(video: HTMLVideoElement) {
  const scanCanvas = document.createElement("canvas");
  scanCanvas.width = 96;
  scanCanvas.height = 54;
  const scanContext = scanCanvas.getContext("2d", { willReadFrequently: true });
  if (!scanContext) {
    return {
      brightness: 0,
      saturation: 0,
      contrast: 0
    };
  }

  scanContext.drawImage(video, 0, 0, scanCanvas.width, scanCanvas.height);
  const { data, width, height } = scanContext.getImageData(
    0,
    0,
    scanCanvas.width,
    scanCanvas.height
  );

  let luminanceTotal = 0;
  let luminanceSquaredTotal = 0;
  let saturationTotal = 0;

  for (let index = 0; index < data.length; index += 4) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    const saturation = max === 0 ? 0 : ((max - min) / max) * 100;

    luminanceTotal += luminance;
    luminanceSquaredTotal += luminance * luminance;
    saturationTotal += saturation;
  }

  const pixelCount = width * height;
  const brightness = pixelCount ? luminanceTotal / pixelCount : 0;
  const meanSquare = pixelCount ? luminanceSquaredTotal / pixelCount : 0;
  const contrast = Math.sqrt(Math.max(meanSquare - brightness * brightness, 0));
  const saturation = pixelCount ? saturationTotal / pixelCount : 0;

  return {
    brightness,
    saturation,
    contrast
  };
}

async function detectFrameConditions(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement
): Promise<DetectResult> {
  const [visualMetrics, faceCount, textDensity, hasText] = await Promise.all([
    Promise.resolve(detectVisualMetrics(video)),
    detectFaceCount(canvas),
    Promise.resolve(detectTextDensity(video)),
    Promise.resolve(detectLikelyTelop(video))
  ]);

  return {
    brightness: visualMetrics.brightness,
    saturation: visualMetrics.saturation,
    contrast: visualMetrics.contrast,
    faceCount,
    textDensity,
    hasText
  };
}

function normalizeShotTelops(shot: ScreenshotCandidate): TelopItem[] {
  if (shot.telops?.length) {
    return shot.telops.map((telop) => ({
      ...defaultTelop,
      ...telop,
      id: telop.id || crypto.randomUUID()
    }));
  }

  return [createTelopItem(shot.telop ?? undefined)];
}

function getShotImageTransform(shot: ScreenshotCandidate) {
  return {
    scale: Math.max(shot.imageScale ?? 1, 1),
    offsetX: clamp(shot.imageOffsetX ?? 0, -1, 1),
    offsetY: clamp(shot.imageOffsetY ?? 0, -3, 3)
  };
}

function getOverlayTransform(shot: ScreenshotCandidate) {
  return {
    scale: Math.max(shot.overlayScale ?? 1, 0.2),
    x: clamp(shot.overlayX ?? 50, 0, 100),
    y: clamp(shot.overlayY ?? 50, 0, 100),
    rotation: shot.overlayRotation ?? 0
  };
}

function drawShotImage(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  shot: ScreenshotCandidate
) {
  const { scale, offsetX, offsetY } = getShotImageTransform(shot);
  const drawWidth = context.canvas.width * scale;
  const drawHeight = context.canvas.height * scale;
  const overflowX = Math.max((drawWidth - context.canvas.width) / 2, 0);
  const overflowY = Math.max((drawHeight - context.canvas.height) / 2, 0);
  const drawX = (context.canvas.width - drawWidth) / 2 + offsetX * overflowX;
  const drawY = (context.canvas.height - drawHeight) / 2 + offsetY * overflowY;

  context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
}

function drawOverlayImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  shot: ScreenshotCandidate
) {
  const { scale, x, y, rotation } = getOverlayTransform(shot);
  const maxBaseWidth = context.canvas.width * 0.42;
  const maxBaseHeight = context.canvas.height * 0.42;
  const fitRatio = Math.min(
    maxBaseWidth / image.naturalWidth,
    maxBaseHeight / image.naturalHeight,
    1
  );
  const drawWidth = image.naturalWidth * fitRatio * scale;
  const drawHeight = image.naturalHeight * fitRatio * scale;
  const centerX = (context.canvas.width * x) / 100;
  const centerY = (context.canvas.height * y) / 100;

  context.save();
  context.translate(centerX, centerY);
  context.rotate((rotation * Math.PI) / 180);
  context.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
  context.restore();
}

function pickHighlights(
  samples: SampleFrame[],
  targetCount: number,
  minGapMultiplier = 1
) {
  const sorted = [...samples].sort((a, b) => b.score - a.score);
  const minGap =
    Math.max(1.6, samples[samples.length - 1]?.time ? samples[samples.length - 1].time / 24 : 1.6) *
    minGapMultiplier;
  const selected: SampleFrame[] = [];

  for (const item of sorted) {
    const tooClose = selected.some(
      (selectedItem) => Math.abs(selectedItem.time - item.time) < minGap
    );
    if (!tooClose) {
      selected.push(item);
    }
    if (selected.length >= targetCount) {
      break;
    }
  }

  if (selected.length < targetCount) {
    for (const sample of samples) {
      if (!selected.find((item) => item.time === sample.time)) {
        selected.push(sample);
      }
      if (selected.length >= targetCount) {
        break;
      }
    }
  }

  return selected.sort((a, b) => a.time - b.time).slice(0, targetCount);
}

export async function extractHighlights(
  file: File,
  targetCount = 20,
  onProgress?: (value: number) => void,
  conditions?: HighlightConditions | null
) {
  const url = URL.createObjectURL(file);
  const video = await createVideo(url);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    URL.revokeObjectURL(url);
    throw new Error("キャンバスが利用できません");
  }

  const duration = video.duration;
  const sampleCount = clamp(Math.round(duration * 2.2), 40, 90);
  const samples: SampleFrame[] = [];
  let prevFingerprint: Uint8ClampedArray | null = null;

  for (let index = 0; index < sampleCount; index += 1) {
    const time = clamp(
      (duration * (index + 1)) / (sampleCount + 1),
      0,
      Math.max(duration - 0.2, 0)
    );
    await seek(video, time);
    const frame = captureFrame(video, canvas, context);
    const detection = conditions
      ? await detectFrameConditions(video, canvas)
      : {
          brightness: 0,
          saturation: 0,
          contrast: 0,
          faceCount: null,
          textDensity: 0,
          hasText: false
        };
    const score = prevFingerprint
      ? diffScore(frame.fingerprint, prevFingerprint)
      : 0;
    prevFingerprint = frame.fingerprint;
    samples.push({
      time,
      score,
      brightness: detection.brightness,
      saturation: detection.saturation,
      contrast: detection.contrast,
      faceCount: detection.faceCount,
      textDensity: detection.textDensity,
      hasText: detection.hasText,
      ...frame
    });
    onProgress?.((index + 1) / sampleCount);
  }

  URL.revokeObjectURL(url);

  let pickedSamples = samples;

  if (conditions) {
    pickedSamples = samples.filter((sample) => {
      const tagOk =
        conditions.sceneTone === "any" ||
        (conditions.sceneTone === "bright" && sample.brightness >= 150) ||
        (conditions.sceneTone === "dark" && sample.brightness <= 95) ||
        (conditions.sceneTone === "vivid" && sample.saturation >= 42) ||
        (conditions.sceneTone === "high-contrast" && sample.contrast >= 58);
      const faceOk =
        conditions.faceFilter === "any" ||
        sample.faceCount === null ||
        (conditions.faceFilter === "face" ? sample.faceCount >= 1 : sample.faceCount === 0);
      const textOk =
        conditions.textAmount === "any" ||
        (conditions.textAmount === "low" && sample.textDensity <= 0.18) ||
        (conditions.textAmount === "high" && sample.textDensity >= 0.28);
      const telopOk = !conditions.noTelop || !sample.hasText;
      return tagOk && faceOk && textOk && telopOk;
    });
  }

  return pickHighlights(
    pickedSamples,
    targetCount,
    conditions?.diversity === "wide" ? 1.4 : 1
  ).map<ScreenshotCandidate>(
    (sample, index) => ({
      id: `${sample.time.toFixed(2)}-${index}`,
      time: sample.time,
      score: sample.score,
      dataUrl: sample.dataUrl,
      width: sample.width,
      height: sample.height,
      telops: [createTelopItem()],
      selectedTelopId: null
    })
  );
}

export async function renderScreenshotWithTelop(
  shot: ScreenshotCandidate
) {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("画像の読み込みに失敗しました"));
    img.src = shot.dataUrl;
  });
  const overlayImage = shot.overlayImageDataUrl
    ? await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("追加画像の読み込みに失敗しました"));
        img.src = shot.overlayImageDataUrl!;
      })
    : null;

  const canvas = document.createElement("canvas");
  canvas.width = shot.width;
  canvas.height = shot.height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("書き出し用キャンバスの初期化に失敗しました");
  }

  drawShotImage(context, image, shot);
  if (overlayImage) {
    drawOverlayImage(context, overlayImage, shot);
  }
  drawTelopOnCanvas(context, shot);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("JPG への変換に失敗しました"));
        return;
      }
      resolve(blob);
    }, "image/jpeg", 0.94);
  });
}

export async function extractNearbyShots(
  file: File,
  centerTime: number,
  count = 30,
  spreadSeconds = 36
) {
  const url = URL.createObjectURL(file);
  const video = await createVideo(url);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    URL.revokeObjectURL(url);
    throw new Error("キャンバスが利用できません");
  }

  const start = clamp(centerTime - spreadSeconds / 2, 0, Math.max(video.duration - 0.2, 0));
  const end = clamp(centerTime + spreadSeconds / 2, 0, Math.max(video.duration - 0.2, 0));
  const duration = Math.max(end - start, 0.001);
  const step = duration / Math.max(count - 1, 1);
  const shots: ScreenshotCandidate[] = [];

  for (let index = 0; index < count; index += 1) {
    const time =
      count === 1
        ? clamp(centerTime, 0, Math.max(video.duration - 0.2, 0))
        : clamp(start + step * index, 0, Math.max(video.duration - 0.2, 0));
    await seek(video, time);
    const frame = captureFrame(video, canvas, context);
    shots.push({
      id: `nearby-${time.toFixed(3)}-${index}`,
      time,
      score: 0,
      dataUrl: frame.dataUrl,
      width: frame.width,
      height: frame.height,
      telops: [createTelopItem()],
      selectedTelopId: null
    });
  }

  URL.revokeObjectURL(url);
  return shots;
}

export async function detectLoudMoments(
  file: File,
  targetCount = 1,
  minGapSeconds = 45
) {
  const audioContext = new AudioContext();
  try {
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    const channels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const windowDuration = 0.5;
    const windowSize = Math.max(1, Math.floor(sampleRate * windowDuration));
    const frameCount = Math.ceil(audioBuffer.length / windowSize);
    const peaks: Array<{ time: number; level: number }> = [];

    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      const start = frameIndex * windowSize;
      const end = Math.min(start + windowSize, audioBuffer.length);
      let energy = 0;
      let sampleCount = 0;

      for (let channelIndex = 0; channelIndex < channels; channelIndex += 1) {
        const channelData = audioBuffer.getChannelData(channelIndex);
        for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
          const value = channelData[sampleIndex];
          energy += value * value;
          sampleCount += 1;
        }
      }

      if (!sampleCount) continue;
      const rms = Math.sqrt(energy / sampleCount);
      peaks.push({
        time: (start + (end - start) / 2) / sampleRate,
        level: rms
      });
    }

    const sorted = [...peaks].sort((a, b) => b.level - a.level);
    const selected: number[] = [];
    for (const peak of sorted) {
      const tooClose = selected.some((time) => Math.abs(time - peak.time) < minGapSeconds);
      if (!tooClose) {
        selected.push(peak.time);
      }
      if (selected.length >= targetCount) break;
    }

    return selected.sort((a, b) => a - b);
  } finally {
    await audioContext.close();
  }
}

export async function extractStoryboardFrames(
  file: File,
  centerTime: number,
  panelCount = 4,
  windowSeconds = 240,
  outputWidth = 960
) {
  const url = URL.createObjectURL(file);
  const video = await createVideo(url);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    URL.revokeObjectURL(url);
    throw new Error("キャンバスが利用できません");
  }

  const safeDuration = Math.max(video.duration - 0.2, 0);
  const start = clamp(centerTime - windowSeconds / 2, 0, safeDuration);
  const end = clamp(centerTime + windowSeconds / 2, 0, safeDuration);
  const span = Math.max(end - start, 0.001);
  const step = panelCount > 1 ? span / (panelCount - 1) : 0;
  const panels: ScreenshotCandidate[] = [];

  for (let index = 0; index < panelCount; index += 1) {
    const time = clamp(start + step * index, 0, safeDuration);
    await seek(video, time);
    const frame = captureFrame(video, canvas, context, outputWidth);
    panels.push({
      id: `storyboard-${time.toFixed(3)}-${index}`,
      time,
      score: 0,
      dataUrl: frame.dataUrl,
      width: frame.width,
      height: frame.height,
      telops: [createTelopItem()],
      selectedTelopId: null
    });
  }

  URL.revokeObjectURL(url);
  return panels;
}

function drawTelopOnCanvas(
  context: CanvasRenderingContext2D,
  shot: ScreenshotCandidate
) {
  normalizeShotTelops(shot).forEach((telop) => {
    const x = (context.canvas.width * telop.x) / 100;
    const y = (context.canvas.height * telop.y) / 100;
    const maxWidth = (context.canvas.width * telop.maxWidth) / 100;
    context.font = `${telop.fontWeight} ${telop.fontSize}px ${telop.fontFamily}`;
    context.textAlign = telop.align;
    context.textBaseline = "middle";

    const lines: string[] = [];
    const paragraphs = telop.text.split("\n");
    paragraphs.forEach((paragraph) => {
      const words = paragraph.split(/\s+/).filter(Boolean);
      if (!words.length) {
        lines.push("");
        return;
      }

      let current = "";
      for (const word of words) {
        const next = current ? `${current} ${word}` : word;
        if (context.measureText(next).width > maxWidth && current) {
          lines.push(current);
          current = word;
        } else {
          current = next;
        }
      }
      if (current) {
        lines.push(current);
      }
    });
    if (!lines.length) {
      lines.push("");
    }

    const lineHeightPx = telop.fontSize * telop.lineHeight;
    const totalHeight = lines.length * lineHeightPx;
    const startY = y - totalHeight / 2 + lineHeightPx / 2;

    // 背景色の描画
    if (telop.backgroundColor) {
      const paddingX = telop.fontSize * 0.2;
      const paddingY = telop.fontSize * 0.25;
      lines.forEach((line, index) => {
        const lineY = startY + index * lineHeightPx;
        const lineWidth = Math.min(context.measureText(line).width, maxWidth);
        let bgX: number;
        if (telop.align === "center") bgX = x - lineWidth / 2;
        else if (telop.align === "right") bgX = x - lineWidth;
        else bgX = x;
        context.save();
        context.globalAlpha = 0.3;
        context.fillStyle = telop.backgroundColor!;
        context.fillRect(
          bgX - paddingX,
          lineY - lineHeightPx / 2 - paddingY / 2,
          lineWidth + paddingX * 2,
          lineHeightPx + paddingY
        );
        context.restore();
      });
    }

    lines.forEach((line, index) => {
      const lineY = startY + index * lineHeightPx;
      if (telop.shadow) {
        context.shadowColor = "rgba(15, 23, 42, 0.35)";
        context.shadowBlur = 18;
        context.shadowOffsetY = 8;
      }
      context.strokeStyle = telop.strokeColor;
      context.lineWidth = telop.strokeWidth;
      context.lineJoin = "round";
      context.miterLimit = 2;
      context.strokeText(line, x, lineY, maxWidth);
      context.fillStyle = telop.color;
      context.fillText(line, x, lineY, maxWidth);
      context.shadowColor = "transparent";
      context.shadowBlur = 0;
      context.shadowOffsetY = 0;
    });
  });
}

export async function renderScreenshotPreviewDataUrl(
  shot: ScreenshotCandidate
) {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("画像の読み込みに失敗しました"));
    img.src = shot.dataUrl;
  });
  const overlayImage = shot.overlayImageDataUrl
    ? await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("追加画像の読み込みに失敗しました"));
        img.src = shot.overlayImageDataUrl!;
      })
    : null;

  const canvas = document.createElement("canvas");
  canvas.width = shot.width;
  canvas.height = shot.height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("プレビュー用キャンバスの初期化に失敗しました");
  }

  drawShotImage(context, image, shot);
  if (overlayImage) {
    drawOverlayImage(context, overlayImage, shot);
  }
  drawTelopOnCanvas(context, shot);
  return canvas.toDataURL("image/jpeg", 0.9);
}
