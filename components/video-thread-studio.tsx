"use client";

import { type ComponentProps, PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import NextImage from "next/image";
import JSZip from "jszip";
import {
  Archive,
  CheckCircle2,
  Clapperboard,
  Clipboard,
  Circle,
  Copy,
  Crop,
  Download,
  ImagePlus,
  LayoutGrid,
  Loader2,
  MoreHorizontal,
  Move,
  Pause,
  Palette,
  Pencil,
  Play,
  Plus,
  RectangleHorizontal,
  RectangleVertical,
  RotateCw,
  Save,
  SkipBack,
  SkipForward,
  Sparkles,
  Square,
  Trash2,
  Type,
  X
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { createTelopItem, defaultTelop } from "@/lib/telop";
import {
  deleteTelopStylePreset,
  deleteThread,
  deleteSnsTemplate,
  getTelopStylePresets,
  getThreads,
  getSnsTemplates,
  getSnsShotPool,
  saveTelopStylePreset,
  saveSnsTemplate,
  saveSnsShotPoolEntry,
  saveThread
} from "@/lib/storage";
import {
  CandidateGroup,
  SavedTelopStylePreset,
  ScenePeakSegment,
  SavedThread,
  SavedVideoSession,
  ScreenshotCandidate,
  ShotFilterType,
  SnsLayoutType,
  SnsPlatform,
  SnsSlide,
  SnsTemplate,
  StorySummaryDetail,
  StorySummarySection,
  TelopItem,
  TelopStyle
} from "@/lib/types";
import { clamp, downloadBlob, formatTimestamp } from "@/lib/utils";
import {
  detectLoudMoments,
  extractHighlights,
  extractNearbyShots,
  extractStoryboardFrames,
  renderScreenshotPreviewDataUrl,
  renderScreenshotWithTelop
} from "@/lib/video";

const FONT_OPTIONS = [
  { label: "ゴシック", value: "'Hiragino Sans', 'Noto Sans JP', sans-serif" },
  { label: "明朝", value: "'Hiragino Mincho ProN', 'Yu Mincho', serif" },
  { label: "丸ゴシック", value: "'Hiragino Maru Gothic ProN', 'Noto Sans JP', sans-serif" }
] as const;

function getFontOptionLabel(fontFamily: string) {
  return FONT_OPTIONS.find((option) => option.value === fontFamily)?.label ?? "カスタム";
}

function getSavedStyleMeta(stylePreset: SavedTelopStylePreset) {
  return {
    fontFamily: stylePreset.style.fontFamily ?? defaultTelop.fontFamily,
    fontWeight: stylePreset.style.fontWeight ?? defaultTelop.fontWeight,
    lineHeight: stylePreset.style.lineHeight ?? defaultTelop.lineHeight
  };
}

function PreviewCanvas({
  shot,
  selectedTelopId,
  onSelectTelop,
  onMoveTelop,
  cropMode,
  overlayMode,
  onMoveImage,
  onMoveOverlay
}: {
  shot: ScreenshotCandidate | null;
  selectedTelopId: string | null;
  onSelectTelop: (telopId: string) => void;
  onMoveTelop: (telopId: string, patch: Pick<TelopStyle, "x" | "y">) => void;
  cropMode: boolean;
  overlayMode: boolean;
  onMoveImage: (patch: Pick<ScreenshotCandidate, "imageOffsetX" | "imageOffsetY">) => void;
  onMoveOverlay: (patch: Pick<ScreenshotCandidate, "overlayX" | "overlayY">) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragTelopIdRef = useRef<string | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const dragMovedRef = useRef(false);
  const dragImageStartRef = useRef<{
    clientX: number;
    clientY: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const dragOverlayStartRef = useRef<{
    clientX: number;
    clientY: number;
    x: number;
    y: number;
  } | null>(null);

  const telops = useMemo(() => {
    if (!shot) return [];
    if (shot.telops?.length) return shot.telops;
    return [createTelopItem(shot.telop ?? undefined)];
  }, [shot]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !shot) return;

    const image = new Image();
    const overlayImage = shot.overlayImageDataUrl ? new Image() : null;
    const draw = () => {
      canvas.width = shot.width;
      canvas.height = shot.height;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.clearRect(0, 0, canvas.width, canvas.height);
      const scale = Math.max(shot.imageScale ?? 1, 1);
      const offsetX = clamp(shot.imageOffsetX ?? 0, -1, 1);
      const offsetY = clamp(shot.imageOffsetY ?? 0, -3, 3);
      const drawWidth = canvas.width * scale;
      const drawHeight = canvas.height * scale;
      const overflowX = Math.max((drawWidth - canvas.width) / 2, 0);
      const overflowY = Math.max((drawHeight - canvas.height) / 2, canvas.height / 2);
      const drawX = (canvas.width - drawWidth) / 2 + offsetX * overflowX;
      const drawY = (canvas.height - drawHeight) / 2 + offsetY * overflowY;

      context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
      if (overlayImage && overlayImage.complete && overlayImage.naturalWidth > 0) {
        const overlayScale = Math.max(shot.overlayScale ?? 1, 0.2);
        const overlayX = clamp(shot.overlayX ?? 50, 0, 100);
        const overlayY = clamp(shot.overlayY ?? 50, 0, 100);
        const overlayRotation = shot.overlayRotation ?? 0;
        const maxBaseWidth = canvas.width * 0.42;
        const maxBaseHeight = canvas.height * 0.42;
        const fitRatio = Math.min(
          maxBaseWidth / overlayImage.naturalWidth,
          maxBaseHeight / overlayImage.naturalHeight,
          1
        );
        const overlayWidth = overlayImage.naturalWidth * fitRatio * overlayScale;
        const overlayHeight = overlayImage.naturalHeight * fitRatio * overlayScale;
        const overlayCenterX = (canvas.width * overlayX) / 100;
        const overlayCenterY = (canvas.height * overlayY) / 100;

        context.save();
        context.translate(overlayCenterX, overlayCenterY);
        context.rotate((overlayRotation * Math.PI) / 180);
        context.drawImage(
          overlayImage,
          -overlayWidth / 2,
          -overlayHeight / 2,
          overlayWidth,
          overlayHeight
        );
        context.restore();
      }

      telops.forEach((telop) => {
        const x = (canvas.width * telop.x) / 100;
        const y = (canvas.height * telop.y) / 100;
        const maxWidth = (canvas.width * telop.maxWidth) / 100;
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
          if (current) lines.push(current);
        });
        if (!lines.length) lines.push("");

        const lineHeightPx = telop.fontSize * telop.lineHeight;
        const totalHeight = lines.length * lineHeightPx;
        const startY = y - totalHeight / 2 + lineHeightPx / 2;

        if (telop.backgroundColor) {
          const paddingX = telop.fontSize * 0.2;
          const paddingY = telop.fontSize * 0.25;
          for (let index = 0; index < lines.length; index += 1) {
            const lineY = startY + index * lineHeightPx;
            const lineWidth = Math.min(context.measureText(lines[index]).width, maxWidth);
            let bgX: number;
            if (telop.align === "center") bgX = x - lineWidth / 2;
            else if (telop.align === "right") bgX = x - lineWidth;
            else bgX = x;
            context.save();
            context.globalAlpha = 0.3;
            context.fillStyle = telop.backgroundColor;
            context.fillRect(bgX - paddingX, lineY - lineHeightPx / 2 - paddingY / 2, lineWidth + paddingX * 2, lineHeightPx + paddingY);
            context.restore();
          }
        }

        for (let index = 0; index < lines.length; index += 1) {
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
          context.strokeText(lines[index], x, lineY, maxWidth);
          context.fillStyle = telop.color;
          context.fillText(lines[index], x, lineY, maxWidth);
          context.shadowColor = "transparent";
          context.shadowBlur = 0;
          context.shadowOffsetY = 0;
        }
      });
    };
    image.onload = draw;
    image.src = shot.dataUrl;
    if (overlayImage && shot.overlayImageDataUrl) {
      overlayImage.onload = draw;
      overlayImage.src = shot.overlayImageDataUrl;
    }
  }, [shot, telops]);

  function updateFromPointer(event: PointerEvent<HTMLDivElement>) {
    const canvas = canvasRef.current;
    const telopId = dragTelopIdRef.current;
    if (!canvas || !shot || !telopId) return;
    const rect = canvas.getBoundingClientRect();
    const x = clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100);
    const y = clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100);
    onMoveTelop(telopId, { x, y });
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>, telopId: string) {
    onSelectTelop(telopId);
    dragTelopIdRef.current = telopId;
    dragStartRef.current = { x: event.clientX, y: event.clientY };
    dragMovedRef.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!dragTelopIdRef.current || !dragStartRef.current) return;
    const deltaX = Math.abs(event.clientX - dragStartRef.current.x);
    const deltaY = Math.abs(event.clientY - dragStartRef.current.y);
    if (!dragMovedRef.current && deltaX < 3 && deltaY < 3) return;
    dragMovedRef.current = true;
    updateFromPointer(event);
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    dragTelopIdRef.current = null;
    dragStartRef.current = null;
    dragMovedRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleImagePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!shot) return;
    dragImageStartRef.current = {
      clientX: event.clientX,
      clientY: event.clientY,
      offsetX: shot.imageOffsetX ?? 0,
      offsetY: shot.imageOffsetY ?? 0
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleImagePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!shot || !dragImageStartRef.current || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const scale = Math.max(shot.imageScale ?? 1, 1);
    const overflowRatioX = Math.max((scale - 1) / 2, 0);
    const overflowRatioY = Math.max((scale - 1) / 2, 0);

    const deltaRatioX = rect.width ? (event.clientX - dragImageStartRef.current.clientX) / rect.width : 0;
    const deltaRatioY = rect.height ? (event.clientY - dragImageStartRef.current.clientY) / rect.height : 0;

    onMoveImage({
      imageOffsetX: overflowRatioX ? clamp(dragImageStartRef.current.offsetX + deltaRatioX / overflowRatioX, -1, 1) : 0,
      imageOffsetY: clamp(dragImageStartRef.current.offsetY + (overflowRatioY ? deltaRatioY / overflowRatioY : deltaRatioY * 3), -3, 3)
    });
  }

  function handleImagePointerUp(event: PointerEvent<HTMLDivElement>) {
    dragImageStartRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleOverlayPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!shot?.overlayImageDataUrl) return;
    dragOverlayStartRef.current = {
      clientX: event.clientX,
      clientY: event.clientY,
      x: shot.overlayX ?? 50,
      y: shot.overlayY ?? 50
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleOverlayPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!dragOverlayStartRef.current || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const deltaX = rect.width ? ((event.clientX - dragOverlayStartRef.current.clientX) / rect.width) * 100 : 0;
    const deltaY = rect.height ? ((event.clientY - dragOverlayStartRef.current.clientY) / rect.height) * 100 : 0;
    onMoveOverlay({
      overlayX: clamp(dragOverlayStartRef.current.x + deltaX, 0, 100),
      overlayY: clamp(dragOverlayStartRef.current.y + deltaY, 0, 100)
    });
  }

  function handleOverlayPointerUp(event: PointerEvent<HTMLDivElement>) {
    dragOverlayStartRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <div className="border border-white/10 bg-white/[0.04]">
      <div className="relative overflow-hidden border border-white/15 bg-slate-950/90 shadow-glow">
        <canvas
          ref={canvasRef}
          className="h-auto w-full"
          aria-label="編集プレビュー"
        />
        {cropMode ? (
          <div
            className="group/crop absolute inset-0 cursor-grab active:cursor-grabbing"
            onPointerDown={handleImagePointerDown}
            onPointerMove={handleImagePointerMove}
            onPointerUp={handleImagePointerUp}
            onPointerCancel={handleImagePointerUp}
          >
            <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-black/35 opacity-0 shadow-[0_0_0_4px_rgba(15,23,42,0.2)] transition-opacity group-active/crop:opacity-100" />
          </div>
        ) : null}
        {overlayMode && shot?.overlayImageDataUrl ? (
          <>
            <div
              className="absolute inset-0 cursor-grab active:cursor-grabbing"
              onPointerDown={handleOverlayPointerDown}
              onPointerMove={handleOverlayPointerMove}
              onPointerUp={handleOverlayPointerUp}
              onPointerCancel={handleOverlayPointerUp}
            />
            <div
              className="pointer-events-none absolute z-10 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-black/35 shadow-[0_0_0_4px_rgba(15,23,42,0.2)]"
              style={{
                left: `${shot.overlayX ?? 50}%`,
                top: `${shot.overlayY ?? 50}%`
              }}
            />
          </>
        ) : null}
        {!overlayMode && telops.map((telop) => {
          const isSelected = telop.id === selectedTelopId;
          return (
            <div
              key={telop.id}
              className="absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full active:cursor-grabbing"
              style={{
                left: `${telop.x}%`,
                top: `${telop.y}%`
              }}
              onPointerDown={(event) => handlePointerDown(event, telop.id)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            >
              <div
                className={`pointer-events-none absolute inset-0 rounded-full border-2 shadow-lg ${
                  isSelected
                    ? "border-white bg-primary/80"
                    : "border-white/70 bg-white/20"
                }`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function IconTooltipButton({
  tooltip,
  children,
  className,
  ...props
}: ComponentProps<typeof Button> & {
  tooltip: string;
}) {
  return (
    <div className="group relative">
      <Button className={className} {...props}>
        {children}
      </Button>
      <div className="pointer-events-none absolute bottom-full left-1/2 z-[140] mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-white/12 bg-[#1f2229] px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-lg transition-opacity duration-75 group-hover:opacity-100">
        {tooltip}
      </div>
    </div>
  );
}

const initialProjectTitle = () =>
  `Project ${new Date().toLocaleDateString("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  })}`;

const PROJECT_TITLE_FALLBACK = "Project";
const STORY_DETAIL_TIME_TOLERANCE = 0.5;
const AI_STORY_SUMMARY_FRAME_COUNT = 4;
const AI_STORY_SUMMARY_OUTPUT_WIDTH = 512;
const AI_STORYBOARD_FRAME_COUNT = 5;
const AI_STORYBOARD_OUTPUT_WIDTH = 640;

function isSameStoryTime(a: number, b: number) {
  return Math.abs(a - b) <= STORY_DETAIL_TIME_TOLERANCE;
}

function normalizeAiErrorMessage(error: unknown) {
  const fallback = "AI の生成に失敗しました。";
  const message = error instanceof Error ? error.message : String(error ?? fallback);
  const lower = message.toLowerCase();

  if (
    lower.includes("resource_exhausted") ||
    lower.includes("quota exceeded") ||
    lower.includes("insufficient_quota") ||
    lower.includes("rate limit") ||
    lower.includes("\"code\":429") ||
    lower.includes('"code":429')
  ) {
    return "AI の利用上限に達しました。少し待ってからもう一度お試しください。";
  }

  if (lower.includes("api key")) {
    return "AI API キーの設定を確認してください。";
  }

  return message;
}

function isTelopDefault(telop: TelopStyle | TelopItem | null) {
  if (!telop) return true;
  return (
    telop.text === defaultTelop.text &&
    telop.fontFamily === defaultTelop.fontFamily &&
    telop.fontWeight === defaultTelop.fontWeight &&
    telop.fontSize === defaultTelop.fontSize &&
    telop.x === defaultTelop.x &&
    telop.y === defaultTelop.y &&
    telop.maxWidth === defaultTelop.maxWidth &&
    telop.lineHeight === defaultTelop.lineHeight &&
    telop.color === defaultTelop.color &&
    telop.strokeColor === defaultTelop.strokeColor &&
    telop.strokeWidth === defaultTelop.strokeWidth &&
    telop.shadow === defaultTelop.shadow &&
    telop.align === defaultTelop.align &&
    telop.preset === defaultTelop.preset
  );
}

type UploadedVideoSession = {
  id: string;
  name: string;
  file: Blob | null;
  url: string;
  candidateShots: ScreenshotCandidate[];
  candidateGroups: CandidateGroup[];
  currentCandidateGroupId: string | null;
  selectedShots: ScreenshotCandidate[];
  progress: number;
  isAnalyzing: boolean;
  status: string;
  storySummary?: StorySummarySection[];
  storyDetails?: StorySummaryDetail[];
};

type AiChatMessage = {
  id: string;
  role: "user" | "model";
  content: string;
};

type SceneSelectionPanelResult = {
  shot: ScreenshotCandidate;
  title: string;
  summary: string;
  shotDirection: string;
  recommendedTelop: string;
};

type SceneSelectionSectionResult = {
  peakTime: number;
  title: string;
  summary: string;
  panels: SceneSelectionPanelResult[];
};

export function VideoThreadStudio() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const newProjectFileInputRef = useRef<HTMLInputElement | null>(null);
  const overlayImageInputRef = useRef<HTMLInputElement | null>(null);
  const projectMenuLayerRef = useRef<HTMLDivElement | null>(null);
  const seekBarRef = useRef<HTMLDivElement | null>(null);
  const sceneSegmentVideoRef = useRef<HTMLVideoElement | null>(null);
  const autoSceneGenerationRef = useRef<string | null>(null);
  const isSeekDraggingRef = useRef(false);
  const uploadedVideosRef = useRef<UploadedVideoSession[]>([]);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoName, setVideoName] = useState("未選択");
  const [uploadedVideos, setUploadedVideos] = useState<UploadedVideoSession[]>([]);
  const [currentVideoId, setCurrentVideoId] = useState<string | null>(null);
  const [candidateShots, setCandidateShots] = useState<ScreenshotCandidate[]>([]);
  const [candidateGroups, setCandidateGroups] = useState<CandidateGroup[]>([]);
  const [currentCandidateGroupId, setCurrentCandidateGroupId] = useState<string | null>(null);
  const [selectedShots, setSelectedShots] = useState<ScreenshotCandidate[]>([]);
  const [selectedShotPreviewMap, setSelectedShotPreviewMap] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [editingShotId, setEditingShotId] = useState<string | null>(null);
  const [savedThreads, setSavedThreads] = useState<SavedThread[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [threadTitle, setThreadTitle] = useState(PROJECT_TITLE_FALLBACK);
  const [newProjectTitle, setNewProjectTitle] = useState(PROJECT_TITLE_FALLBACK);
  const [newProjectFiles, setNewProjectFiles] = useState<File[]>([]);
  const [newProjectDialogOpen, setNewProjectDialogOpen] = useState(false);
  const [projectDialogMode, setProjectDialogMode] = useState<"create" | "edit">("create");
  const [projectDialogTargetId, setProjectDialogTargetId] = useState<string | null>(null);
  const [projectMenuId, setProjectMenuId] = useState<string | null>(null);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [projectPendingDelete, setProjectPendingDelete] = useState<SavedThread | null>(null);
  const [existingVideoPendingDelete, setExistingVideoPendingDelete] = useState<UploadedVideoSession | null>(null);
  const [selectedShotIds, setSelectedShotIds] = useState<string[]>([]);
  const [isSelectingShots, setIsSelectingShots] = useState(false);
  const [nearbyTargetShot, setNearbyTargetShot] = useState<ScreenshotCandidate | null>(null);
  const [nearbyShots, setNearbyShots] = useState<ScreenshotCandidate[]>([]);
  const [isLoadingNearbyShots, setIsLoadingNearbyShots] = useState(false);
  const [isGeminiEnabled, setIsGeminiEnabled] = useState(false);
  const [isLoadingAiStatus, setIsLoadingAiStatus] = useState(true);
  const [centerTab, setCenterTab] = useState<"preview" | "highlights" | "scene-selection">("preview");
  const [sceneSelectionSections, setSceneSelectionSections] = useState<SceneSelectionSectionResult[]>([]);
  const [isGeneratingSceneSelection, setIsGeneratingSceneSelection] = useState(false);
  const [scenePeakSegments, setScenePeakSegments] = useState<ScenePeakSegment[]>([]);
  const [scenePreviewSegment, setScenePreviewSegment] = useState<ScenePeakSegment | null>(null);
  const [isGeneratingStory, setIsGeneratingStory] = useState(false);
  const [storyDetailTarget, setStoryDetailTarget] = useState<StorySummarySection | null>(null);
  const [storyDetailResult, setStoryDetailResult] = useState<StorySummaryDetail | null>(null);
  const [isGeneratingStoryDetail, setIsGeneratingStoryDetail] = useState(false);
  const [bulkDeleteShotsOpen, setBulkDeleteShotsOpen] = useState(false);
  const [telopResetConfirmOpen, setTelopResetConfirmOpen] = useState(false);
  const [telopPendingDeleteId, setTelopPendingDeleteId] = useState<string | null>(null);
  const [savedTelopStyles, setSavedTelopStyles] = useState<SavedTelopStylePreset[]>([]);
  const [saveTelopStyleDialogOpen, setSaveTelopStyleDialogOpen] = useState(false);
  const [applyTelopStyleDialogOpen, setApplyTelopStyleDialogOpen] = useState(false);
  const [telopStyleName, setTelopStyleName] = useState("");
  const [isCroppingShot, setIsCroppingShot] = useState(false);
  const [isTransformingOverlay, setIsTransformingOverlay] = useState(false);
  const [copiedTelop, setCopiedTelop] = useState<TelopItem | null>(null);
  const [snsTemplates, setSnsTemplates] = useState<SnsTemplate[]>([]);
  const [snsTemplateDialogOpen, setSnsTemplateDialogOpen] = useState(false);
  const [editingSnsTemplate, setEditingSnsTemplate] = useState<SnsTemplate | null>(null);
  const [snsSlotPickerTarget, setSnsSlotPickerTarget] = useState<{ slideIndex: number; slotIndex: number } | null>(null);
  const [snsSlideDeleteTarget, setSnsSlideDeleteTarget] = useState<number | null>(null);
  const [snsShotPool, setSnsShotPool] = useState<Record<string, ScreenshotCandidate>>({});
  const [snsNewNameDialogOpen, setSnsNewNameDialogOpen] = useState(false);
  const [snsNewName, setSnsNewName] = useState("");
  const [snsNewPlatform, setSnsNewPlatform] = useState<SnsPlatform>("youtube");
  const [snsTemplateDeleteTarget, setSnsTemplateDeleteTarget] = useState<SnsTemplate | null>(null);
  const [snsTelopEditCropRatio, setSnsTelopEditCropRatio] = useState<number | null>(null);
  const snsPickerVideoRef = useRef<HTMLVideoElement | null>(null);
  const [shotFilterDialogOpen, setShotFilterDialogOpen] = useState(false);
  const [shotFilterType, setShotFilterType] = useState<ShotFilterType>("telop");
  const [shotFilterValue, setShotFilterValue] = useState<string>("telop-no");
  const [isFilteringShots, setIsFilteringShots] = useState(false);
  const [shotReplacePickerOpen, setShotReplacePickerOpen] = useState(false);
  const [replaceNearbyShots, setReplaceNearbyShots] = useState<ScreenshotCandidate[]>([]);
  const [isLoadingReplaceNearby, setIsLoadingReplaceNearby] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);
  const [status, setStatus] = useState("動画を読み込むと、見どころのスクリーンショットを自動で20件選出します。");
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const editingShot = useMemo(
    () => selectedShots.find((shot) => shot.id === editingShotId) ?? (editingShotId ? snsShotPool[editingShotId] ?? null : null),
    [selectedShots, snsShotPool, editingShotId]
  );

  const editingTelops = useMemo(() => {
    if (!editingShot) return [];
    return editingShot.telops?.length
      ? editingShot.telops
      : [createTelopItem(editingShot.telop ?? undefined)];
  }, [editingShot]);

  const selectedEditingTelop = useMemo(() => {
    if (!editingShot) return null;
    const selectedId = editingShot.selectedTelopId ?? editingTelops[0]?.id ?? null;
    return editingTelops.find((telop) => telop.id === selectedId) ?? editingTelops[0] ?? null;
  }, [editingShot, editingTelops]);

  const isSelectedEditingTelopDirty = useMemo(
    () => !isTelopDefault(selectedEditingTelop),
    [selectedEditingTelop]
  );

  const currentSceneSelectionVideo = useMemo(
    () => uploadedVideos.find((video) => video.id === currentVideoId) ?? null,
    [uploadedVideos, currentVideoId]
  );

  const currentStorySummary = useMemo(
    () =>
      uploadedVideos.find((video) => video.id === currentVideoId)?.storySummary ?? [],
    [uploadedVideos, currentVideoId]
  );

  const visibleScenePeakSegments = useMemo(
    () =>
      currentVideoId
        ? scenePeakSegments.filter((segment) => segment.videoId === currentVideoId)
        : [],
    [currentVideoId, scenePeakSegments]
  );

  const canAnalyzeCurrentSceneSelectionVideo = Boolean(currentSceneSelectionVideo?.file);

  useEffect(() => {
    if (currentVideoId) {
      autoSceneGenerationRef.current = null;
    }
  }, [currentVideoId]);

  useEffect(() => {
    if (
      centerTab !== "scene-selection" ||
      !currentSceneSelectionVideo?.file ||
      !currentVideoId ||
      isGeneratingSceneSelection ||
      visibleScenePeakSegments.length
    ) {
      return;
    }

    if (autoSceneGenerationRef.current === currentVideoId) {
      return;
    }

    autoSceneGenerationRef.current = currentVideoId;
    void generateSceneSelection();
  }, [
    centerTab,
    currentSceneSelectionVideo,
    currentVideoId,
    isGeneratingSceneSelection,
    visibleScenePeakSegments.length
  ]);

  useEffect(() => {
    getTelopStylePresets()
      .then((styles) => setSavedTelopStyles(styles))
      .catch(() => setSavedTelopStyles([]));
    getSnsTemplates()
      .then((templates) => setSnsTemplates(templates))
      .catch(() => setSnsTemplates([]));
    getSnsShotPool()
      .then((pool) => setSnsShotPool(pool))
      .catch(() => setSnsShotPool({}));
  }, []);

  useEffect(() => {
    if (!editingSnsTemplate) return;
    const timer = setTimeout(() => {
      setSnsTemplates((prev) => {
        const idx = prev.findIndex((t) => t.id === editingSnsTemplate.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = editingSnsTemplate;
          return next;
        }
        return prev;
      });
      void saveSnsTemplate(editingSnsTemplate);
    }, 500);
    return () => clearTimeout(timer);
  }, [editingSnsTemplate]);

  useEffect(() => {
    getThreads()
      .then((threads) => {
        setSavedThreads(threads);
        if (threads[0]) {
          loadThread(threads[0]);
        }
      })
      .catch(() => {
        setStatus("保存済みプロジェクトの読み込みに失敗しました。");
      });
  }, []);

  useEffect(() => {
    if (currentProjectId) return;
    const nextTitle = initialProjectTitle();
    setThreadTitle((current) => (current === PROJECT_TITLE_FALLBACK ? nextTitle : current));
    setNewProjectTitle((current) => (current === PROJECT_TITLE_FALLBACK ? nextTitle : current));
  }, [currentProjectId]);

  useEffect(() => {
    setIsCroppingShot(false);
    setIsTransformingOverlay(false);
  }, [editingShotId]);

  useEffect(() => {
    uploadedVideosRef.current = uploadedVideos;
  }, [uploadedVideos]);

  useEffect(() => {
    return () => {
      uploadedVideosRef.current.forEach((video) => {
        URL.revokeObjectURL(video.url);
      });
    };
  }, []);

  useEffect(() => {
    if (!snackbarMessage) return;
    const timeoutId = window.setTimeout(() => {
      setSnackbarMessage(null);
    }, 2200);
    return () => window.clearTimeout(timeoutId);
  }, [snackbarMessage]);

  useEffect(() => {
    let cancelled = false;

    async function loadAiStatus() {
      try {
        const response = await fetch("/api/ai/status");
        const payload = await response.json();
        if (!cancelled) {
          setIsGeminiEnabled(Boolean(payload.geminiEnabled));
        }
      } catch {
        if (!cancelled) {
          setIsGeminiEnabled(false);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingAiStatus(false);
        }
      }
    }

    void loadAiStatus();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const video = sceneSegmentVideoRef.current;
    const segment = scenePreviewSegment;
    if (!video || !segment) return;
    const sourceVideo = uploadedVideos.find((uploadedVideo) => uploadedVideo.id === segment.videoId);
    if (!sourceVideo?.url) return;
    const activeVideo = video;
    const activeSegment = segment;

    function seekToSegmentStart() {
      activeVideo.currentTime = activeSegment.rangeStart;
      void activeVideo.play().catch(() => {});
    }

    function clampSegmentPlayback() {
      if (activeVideo.currentTime >= activeSegment.rangeEnd) {
        activeVideo.pause();
        activeVideo.currentTime = activeSegment.rangeEnd;
      }
    }

    activeVideo.addEventListener("loadedmetadata", seekToSegmentStart);
    activeVideo.addEventListener("timeupdate", clampSegmentPlayback);
    if (activeVideo.readyState >= 1) {
      seekToSegmentStart();
    }

    return () => {
      activeVideo.removeEventListener("loadedmetadata", seekToSegmentStart);
      activeVideo.removeEventListener("timeupdate", clampSegmentPlayback);
    };
  }, [scenePreviewSegment, uploadedVideos]);

  useEffect(() => {
    setSelectedShotIds((current) =>
      current.filter((id) => selectedShots.some((shot) => shot.id === id))
    );
  }, [selectedShots]);

  useEffect(() => {
    if (!isSelectingShots) {
      setSelectedShotIds([]);
    }
  }, [isSelectingShots]);

  useEffect(() => {
    if (!currentVideoId) return;

    setUploadedVideos((current) =>
      current.map((video) =>
        video.id === currentVideoId
          ? {
              ...video,
              name: videoName,
              url: videoUrl ?? video.url,
              candidateShots,
              candidateGroups,
              currentCandidateGroupId,
              progress,
              isAnalyzing,
              status
            }
          : video
      )
    );
  }, [
    candidateShots,
    candidateGroups,
    currentCandidateGroupId,
    currentVideoId,
    isAnalyzing,
    progress,
    status,
    videoName,
    videoUrl
  ]);

  useEffect(() => {
    if (!currentProjectId) return;

    const timeoutId = window.setTimeout(async () => {
      const project = buildProjectPayload(currentProjectId, threadTitle);
      await saveThread(project);
      const next = await getThreads();
      setSavedThreads(next);
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [candidateShots, currentProjectId, currentVideoId, progress, scenePeakSegments, selectedShots, status, threadTitle, uploadedVideos, videoName]);

  useEffect(() => {
    if (!projectMenuId) return;

    function handlePointerDown(event: MouseEvent) {
      if (
        projectMenuLayerRef.current &&
        !projectMenuLayerRef.current.contains(event.target as Node)
      ) {
        setProjectMenuId(null);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [projectMenuId]);

  useEffect(() => {
    let cancelled = false;

    async function buildPreviewMap() {
      const entries = await Promise.all(
        selectedShots.map(async (shot) => [
          shot.id,
          await renderScreenshotPreviewDataUrl(shot)
        ] as const)
      );

      if (!cancelled) {
        setSelectedShotPreviewMap((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
      }
    }

    if (!selectedShots.length) {
      setSelectedShotPreviewMap({});
      return;
    }

    void buildPreviewMap();

    return () => {
      cancelled = true;
    };
  }, [selectedShots]);

  useEffect(() => {
    let cancelled = false;
    const shots = Object.values(snsShotPool);
    if (!shots.length) return;
    async function buildPoolPreviews() {
      const entries = await Promise.all(
        shots.map(async (shot) => [shot.id, await renderScreenshotPreviewDataUrl(shot)] as const)
      );
      if (!cancelled) {
        setSelectedShotPreviewMap((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
      }
    }
    void buildPoolPreviews();
    return () => { cancelled = true; };
  }, [snsShotPool]);

  function cloneShot(shot: ScreenshotCandidate) {
    const telops =
      shot.telops?.length
        ? shot.telops.map((telop) => ({
            ...defaultTelop,
            ...telop,
            id: telop.id || crypto.randomUUID()
          }))
        : [createTelopItem(shot.telop ?? undefined)];

    return {
      ...shot,
      imageScale: Math.max(shot.imageScale ?? 1, 1),
      imageOffsetX: clamp(shot.imageOffsetX ?? 0, -1, 1),
      imageOffsetY: clamp(shot.imageOffsetY ?? 0, -1, 1),
      overlayImageDataUrl: shot.overlayImageDataUrl ?? null,
      overlayScale: Math.max(shot.overlayScale ?? 1, 0.2),
      overlayX: clamp(shot.overlayX ?? 50, 0, 100),
      overlayY: clamp(shot.overlayY ?? 50, 0, 100),
      overlayRotation: shot.overlayRotation ?? 0,
      telops,
      selectedTelopId:
        shot.selectedTelopId && telops.some((telop) => telop.id === shot.selectedTelopId)
          ? shot.selectedTelopId
          : telops[0]?.id ?? null
    };
  }

  function cloneCandidateGroup(group: CandidateGroup) {
    return {
      ...group,
      conditions: group.conditions ? { ...group.conditions } : null,
      shots: group.shots.map((shot) => cloneShot(shot))
    };
  }

  function createDefaultCandidateGroup(shots: ScreenshotCandidate[]): CandidateGroup {
    return {
      id: "default",
      label: "見どころ",
      conditions: null,
      shots: shots.map((shot) => cloneShot(shot))
    };
  }

  function syncCandidateShotsFromGroup(groups: CandidateGroup[], nextGroupId?: string | null) {
    const activeGroup =
      groups.find((group) => group.id === (nextGroupId ?? currentCandidateGroupId)) ??
      groups[0] ??
      null;
    setCurrentCandidateGroupId(activeGroup?.id ?? null);
    setCandidateShots(activeGroup?.shots ?? []);
  }

  function updateShotInPools(shotId: string, updater: (shot: ScreenshotCandidate) => ScreenshotCandidate) {
    setSelectedShots((current) => current.map((s) => (s.id === shotId ? updater(s) : s)));
    setSnsShotPool((prev) => {
      if (!prev[shotId]) return prev;
      const updated = updater(prev[shotId]);
      void saveSnsShotPoolEntry(updated);
      return { ...prev, [shotId]: updated };
    });
  }

  function updateEditingShotTelop(patch: Partial<TelopStyle>) {
    if (!editingShot || !selectedEditingTelop) return;
    updateShotInPools(editingShot.id, (shot) => ({
      ...shot,
      telops: (shot.telops?.length ? shot.telops : editingTelops).map((telop) =>
        telop.id === selectedEditingTelop.id
          ? { ...telop, ...patch }
          : telop
      )
    }));
  }

  function updateEditingShotImage(
    patch: Pick<ScreenshotCandidate, "imageScale" | "imageOffsetX" | "imageOffsetY">
  ) {
    if (!editingShot) return;
    updateShotInPools(editingShot.id, (shot) => ({
      ...shot,
      imageScale: patch.imageScale ?? shot.imageScale ?? 1,
      imageOffsetX: patch.imageOffsetX ?? shot.imageOffsetX ?? 0,
      imageOffsetY: patch.imageOffsetY ?? shot.imageOffsetY ?? 0
    }));
  }

  function updateEditingShotOverlay(
    patch: Pick<
      ScreenshotCandidate,
      "overlayImageDataUrl" | "overlayScale" | "overlayX" | "overlayY" | "overlayRotation"
    >
  ) {
    if (!editingShot) return;
    updateShotInPools(editingShot.id, (shot) => ({
      ...shot,
      overlayImageDataUrl:
        "overlayImageDataUrl" in patch
          ? patch.overlayImageDataUrl ?? null
          : shot.overlayImageDataUrl ?? null,
      overlayScale:
        "overlayScale" in patch
          ? Math.max(patch.overlayScale ?? 1, 0.2)
          : Math.max(shot.overlayScale ?? 1, 0.2),
      overlayX:
        "overlayX" in patch
          ? patch.overlayX ?? 50
          : shot.overlayX ?? 50,
      overlayY:
        "overlayY" in patch
          ? patch.overlayY ?? 50
          : shot.overlayY ?? 50,
      overlayRotation:
        "overlayRotation" in patch
          ? patch.overlayRotation ?? 0
          : shot.overlayRotation ?? 0
    }));
  }

  async function handleOverlayImageSelected(file: File | null) {
    if (!file || !editingShot) return;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("画像の読み込みに失敗しました"));
      reader.readAsDataURL(file);
    });

    updateEditingShotOverlay({
      overlayImageDataUrl: dataUrl,
      overlayScale: editingShot.overlayScale ?? 1,
      overlayX: editingShot.overlayX ?? 50,
      overlayY: editingShot.overlayY ?? 50,
      overlayRotation: editingShot.overlayRotation ?? 0
    });
    setIsTransformingOverlay(true);
  }

  function selectEditingTelop(telopId: string) {
    if (!editingShot) return;
    updateShotInPools(editingShot.id, (shot) => ({ ...shot, selectedTelopId: telopId }));
  }

  function addEditingTelop() {
    if (!editingShot) return;
    const telops = editingShot.telops?.length ? editingShot.telops : editingTelops;
    const currentTelop = telops.find((t) => t.id === editingShot.selectedTelopId) ?? telops[0];
    const aboveY = currentTelop ? Math.max(currentTelop.y - 15, 5) : 50;
    const nextTelop = createTelopItem({ y: aboveY });
    updateShotInPools(editingShot.id, (shot) => ({
      ...shot,
      telops: [...(shot.telops?.length ? shot.telops : editingTelops), nextTelop],
      selectedTelopId: nextTelop.id
    }));
  }

  function deleteEditingTelop(telopId: string) {
    if (!editingShot || editingTelops.length <= 1) return;
    const remaining = editingTelops.filter((telop) => telop.id !== telopId);
    updateShotInPools(editingShot.id, (shot) => ({
      ...shot,
      telops: remaining,
      selectedTelopId:
        shot.selectedTelopId === telopId
          ? remaining[0]?.id ?? null
          : shot.selectedTelopId
    }));
  }

  function resetEditingTelop() {
    if (!selectedEditingTelop) return;
    updateEditingShotTelop(defaultTelop);
    setTelopResetConfirmOpen(false);
  }

  function confirmDeleteEditingTelop() {
    if (!telopPendingDeleteId) return;
    deleteEditingTelop(telopPendingDeleteId);
    setTelopPendingDeleteId(null);
  }

  function copyEditingTelop() {
    if (!selectedEditingTelop) return;
    setCopiedTelop({ ...selectedEditingTelop });
    setStatus("このテロップをコピーしました。");
  }

  function pasteEditingTelop() {
    if (!editingShot || !selectedEditingTelop || !copiedTelop) return;
    updateShotInPools(editingShot.id, (shot) => ({
      ...shot,
      telops: (shot.telops ?? []).map((telop) =>
        telop.id === selectedEditingTelop.id
          ? { ...copiedTelop, id: telop.id }
          : telop
      )
    }));
    setStatus("コピーしたテロップを貼り付けました。");
  }

  async function saveCurrentTelopStyle() {
    if (!selectedEditingTelop || !telopStyleName.trim()) return;
    const nextPreset: SavedTelopStylePreset = {
      id: crypto.randomUUID(),
      name: telopStyleName.trim(),
      createdAt: new Date().toISOString(),
      style: {
        maxWidth: selectedEditingTelop.maxWidth,
        fontFamily: selectedEditingTelop.fontFamily,
        fontWeight: selectedEditingTelop.fontWeight,
        fontSize: selectedEditingTelop.fontSize,
        lineHeight: selectedEditingTelop.lineHeight,
        strokeWidth: selectedEditingTelop.strokeWidth,
        color: selectedEditingTelop.color,
        strokeColor: selectedEditingTelop.strokeColor
      }
    };
    await saveTelopStylePreset(nextPreset);
    setSavedTelopStyles((current) => [nextPreset, ...current]);
    setSaveTelopStyleDialogOpen(false);
    setTelopStyleName("");
  }

  function applySavedTelopStyle(stylePreset: SavedTelopStylePreset) {
    updateEditingShotTelop(stylePreset.style);
    setApplyTelopStyleDialogOpen(false);
  }

  async function removeSavedTelopStyle(stylePresetId: string) {
    await deleteTelopStylePreset(stylePresetId);
    setSavedTelopStyles((current) => current.filter((stylePreset) => stylePreset.id !== stylePresetId));
  }

  function buildProjectPayload(projectId: string, title: string): SavedThread {
    const videos: SavedVideoSession[] = uploadedVideosRef.current.map((video) => ({
      id: video.id,
      name: video.name,
      file: video.file,
      candidateShots: video.candidateShots.map((shot) => cloneShot(shot)),
      candidateGroups: video.candidateGroups.map((group) => cloneCandidateGroup(group)),
      currentCandidateGroupId: video.currentCandidateGroupId,
      selectedShots: video.selectedShots.map((shot) => cloneShot(shot)),
      storySummary: video.storySummary ?? [],
      storyDetails:
        video.storyDetails?.map((detail) => ({
          ...detail,
          panels: detail.panels.map((panel) => ({
            ...panel,
            shot: cloneShot(panel.shot)
          }))
        })) ?? [],
      progress: video.progress,
      isAnalyzing: video.isAnalyzing,
      status: video.status
    }));

    return {
      id: projectId,
      title,
      videoName,
      createdAt:
        savedThreads.find((project) => project.id === projectId)?.createdAt ??
        new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      currentVideoId,
      videos,
      sceneSegments: scenePeakSegments.map((segment) => ({
        ...segment,
        thumbnailShot: cloneShot(segment.thumbnailShot)
      })),
      items: selectedShots.map((item) => ({
        ...item,
        createdAt: new Date().toISOString()
      }))
    };
  }

  function addSelectedShot(candidate: ScreenshotCandidate) {
    const nextShot = cloneShot(candidate);
    nextShot.id = `selected-${crypto.randomUUID()}`;
    nextShot.telops = [createTelopItem()];
    nextShot.selectedTelopId = nextShot.telops[0].id;
    setSelectedShots((current) => [...current, nextShot]);
    setSnackbarMessage(`${formatTimestamp(candidate.time)} のショットを追加しました。`);
  }

  function toggleSelectedShotId(shotId: string) {
    setSelectedShotIds((current) =>
      current.includes(shotId)
        ? current.filter((id) => id !== shotId)
        : [...current, shotId]
    );
  }

  function selectAllShots() {
    setSelectedShotIds(selectedShots.map((shot) => shot.id));
  }

  function toggleSelectAllShots() {
    const allSelected =
      selectedShots.length > 0 && selectedShotIds.length === selectedShots.length;

    if (allSelected) {
      setSelectedShotIds([]);
      return;
    }

    selectAllShots();
  }

  function seekToShotTime(time: number) {
    seekToTime(time);
    const previewSection = videoRef.current?.closest("section");
    previewSection?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleLoadedMetadata() {
    const video = videoRef.current;
    if (!video) return;
    setVideoDuration(video.duration || 0);
    setVideoCurrentTime(video.currentTime || 0);
  }

  function handleVideoTimeUpdate() {
    const video = videoRef.current;
    if (!video) return;
    setVideoCurrentTime(video.currentTime);
  }

  async function togglePlayback() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      await video.play();
      setIsVideoPlaying(true);
    } else {
      video.pause();
      setIsVideoPlaying(false);
    }
  }

  function seekToTime(time: number) {
    const video = videoRef.current;
    if (!video) return;
    const nextTime = clamp(time, 0, videoDuration || video.duration || 0);
    video.currentTime = nextTime;
    setVideoCurrentTime(nextTime);
  }

  function getSeekTimeFromPointer(clientX: number, element: HTMLElement) {
    const rect = element.getBoundingClientRect();
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
    return {
      ratio,
      time: ratio * videoDuration
    };
  }

  function updateSeekFromClientX(clientX: number) {
    if (!seekBarRef.current || !videoUrl || !videoDuration) return;
    const { time } = getSeekTimeFromPointer(clientX, seekBarRef.current);
    seekToTime(time);
  }

  function handleSeekPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!videoUrl || !videoDuration) return;
    isSeekDraggingRef.current = true;
    updateSeekFromClientX(event.clientX);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleSeekPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!videoUrl || !videoDuration) return;
    if (!isSeekDraggingRef.current || (event.buttons & 1) !== 1) return;
    updateSeekFromClientX(event.clientX);
  }

  function handleSeekPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (!videoUrl || !videoDuration) return;
    isSeekDraggingRef.current = false;
    updateSeekFromClientX(event.clientX);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleSeekPointerCancel(event: React.PointerEvent<HTMLDivElement>) {
    isSeekDraggingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function nudgeVideo(seconds: number) {
    const video = videoRef.current;
    if (!video) return;
    const nextTime = clamp(video.currentTime + seconds, 0, videoDuration || video.duration || 0);
    video.currentTime = nextTime;
    setVideoCurrentTime(nextTime);
  }

  async function captureCurrentFrame() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;

    const canvas = document.createElement("canvas");
    const width = 960;
    const height = Math.round((width / video.videoWidth) * video.videoHeight);
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const manualShot: ScreenshotCandidate = {
      id: `manual-${crypto.randomUUID()}`,
      time: video.currentTime,
      score: 0,
      dataUrl: canvas.toDataURL("image/jpeg", 0.92),
      width,
      height,
      telops: [createTelopItem()],
      selectedTelopId: null
    };

    manualShot.selectedTelopId = manualShot.telops?.[0]?.id ?? null;

    setSelectedShots((current) => [...current, manualShot]);
    setStatus(`手動キャプチャを追加しました。${formatTimestamp(video.currentTime)} のショットを編集できます。`);
  }

  useEffect(() => {
    function handleWindowKeydown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName;
      const isEditable =
        tagName === "INPUT" ||
        tagName === "TEXTAREA" ||
        target?.isContentEditable;

      if (isEditable || !videoUrl) return;

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        nudgeVideo(-1);
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        nudgeVideo(1);
      }
    }

    window.addEventListener("keydown", handleWindowKeydown);
    return () => window.removeEventListener("keydown", handleWindowKeydown);
  }, [videoDuration, videoUrl]);

  function selectUploadedVideo(videoId: string) {
    const nextVideo = uploadedVideos.find((video) => video.id === videoId);
    if (!nextVideo) return;

    setCurrentVideoId(nextVideo.id);
    setVideoUrl(nextVideo.url);
    setVideoName(nextVideo.name);
    setCandidateGroups(nextVideo.candidateGroups);
    syncCandidateShotsFromGroup(nextVideo.candidateGroups, nextVideo.currentCandidateGroupId);
    setProgress(nextVideo.progress);
    setIsAnalyzing(nextVideo.isAnalyzing);
    setStatus(nextVideo.status);
    setEditingShotId(null);
    setSceneSelectionSections([]);
    setCenterTab("preview");
    setVideoCurrentTime(0);
    setVideoDuration(0);
    setIsVideoPlaying(false);
  }

  function replaceSceneSegmentsForVideo(videoId: string, segments: ScenePeakSegment[]) {
    setScenePeakSegments((current) => [
      ...current.filter((segment) => segment.videoId !== videoId),
      ...segments
    ]);
  }

  async function generateSceneSegmentsForVideo(
    video: Pick<UploadedVideoSession, "id" | "name" | "file">
  ) {
    if (!video.file) return [];

    const peaks = await detectLoudMoments(video.file as File, 5, 120);
    const peakTimes = peaks.length ? peaks : [0];
    const sortedPeaks = [...peakTimes].sort((a, b) => a - b);

    return Promise.all(
      sortedPeaks.slice(0, 5).map(async (peakTime) => {
        const rangeStart = Math.max(peakTime - 120, 0);
        const rangeEnd = peakTime + 120;
        const [thumbnailShot] = await extractStoryboardFrames(video.file as File, peakTime, 1, 12);
        return {
          id: crypto.randomUUID(),
          videoId: video.id,
          videoName: video.name,
          peakTime,
          rangeStart,
          rangeEnd,
          thumbnailShot
        };
      })
    );
  }

  async function addUploadedVideo(file: File) {
    const nextVideoId = crypto.randomUUID();
    const nextVideoUrl = URL.createObjectURL(file);
    const analyzingStatus = "動画を解析して見どころ候補を抽出しています...";

    setVideoUrl(nextVideoUrl);
    setVideoName(file.name);
    setUploadedVideos((current) => [
      {
        id: nextVideoId,
        name: file.name,
        file,
        url: nextVideoUrl,
        candidateShots: [],
        candidateGroups: [],
        currentCandidateGroupId: "default",
        selectedShots,
        storySummary: [],
        storyDetails: [],
        progress: 0,
        isAnalyzing: true,
        status: analyzingStatus
      },
      ...current
    ]);
    setCurrentVideoId(nextVideoId);
    setCandidateGroups([]);
    setCurrentCandidateGroupId("default");
    setCandidateShots([]);
    setSceneSelectionSections([]);
    setCenterTab("preview");
    setEditingShotId(null);
    setVideoCurrentTime(0);
    setVideoDuration(0);
    setIsVideoPlaying(false);
    setIsAnalyzing(true);
    setProgress(0);
    setStatus(analyzingStatus);

    try {
      const highlights = await extractHighlights(file, 20, setProgress);
      const defaultGroup = createDefaultCandidateGroup(highlights);
      setCandidateGroups([defaultGroup]);
      setCurrentCandidateGroupId(defaultGroup.id);
      setCandidateShots(defaultGroup.shots);
      setStatus("見どころ候補を抽出しました。続けて盛り上がり区間を検出しています...");
      const segments = await generateSceneSegmentsForVideo({
        id: nextVideoId,
        name: file.name,
        file
      });
      replaceSceneSegmentsForVideo(nextVideoId, segments);
      setStatus("20件の候補と盛り上がり区間を抽出しました。下の一覧から選んでテロップを調整できます。");
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "スクリーンショット抽出に失敗しました。"
      );
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function handleVideoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    await addUploadedVideo(file);
    event.target.value = "";
  }

  function handleNewProjectFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;

    setNewProjectFiles((current) => {
      const next = [...current];
      for (const file of files) {
        const exists = next.some(
          (item) =>
            item.name === file.name &&
            item.size === file.size &&
            item.lastModified === file.lastModified
        );
        if (!exists) {
          next.push(file);
        }
      }
      return next;
    });

    event.target.value = "";
  }

  function removeNewProjectFile(fileIndex: number) {
    setNewProjectFiles((current) => current.filter((_, index) => index !== fileIndex));
  }

  async function openNearbyShotsDialog(candidate: ScreenshotCandidate) {
    const activeVideo = uploadedVideos.find((video) => video.id === currentVideoId);
    if (!activeVideo?.file) return;

    setNearbyTargetShot(candidate);
    setNearbyShots([]);
    setIsLoadingNearbyShots(true);

    try {
      const shots = await extractNearbyShots(activeVideo.file as File, candidate.time, 30, 36);
      setNearbyShots(shots);
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "近い候補の抽出に失敗しました。"
      );
    } finally {
      setIsLoadingNearbyShots(false);
    }
  }

  async function generateSceneSelection() {
    const activeVideo = uploadedVideos.find((video) => video.id === currentVideoId);
    if (!activeVideo?.file) {
      setSnackbarMessage("この動画は本体ファイルが無いため、再解析できません。");
      setStatus("この動画は本体ファイルが無いため、シーン選定を実行できません。プロジェクト編集から動画を追加し直してください。");
      return;
    }

    setIsGeneratingSceneSelection(true);
    setSceneSelectionSections([]);
    setStatus("盛り上がり区間を検出しています...");

    try {
      const sections = await generateSceneSegmentsForVideo({
        id: activeVideo.id,
        name: activeVideo.name,
        file: activeVideo.file
      });
      replaceSceneSegmentsForVideo(activeVideo.id, sections);
      setStatus("盛り上がり区間を5つ検出しました。");
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "シーン選定の生成に失敗しました。"
      );
    } finally {
      setIsGeneratingSceneSelection(false);
    }
  }

  async function generateStorySummary() {
    const activeVideo = uploadedVideos.find((video) => video.id === currentVideoId);
    if (!activeVideo?.file) {
      setSnackbarMessage("この動画は本体ファイルが無いため、ストーリーを生成できません。");
      setStatus("この動画は本体ファイルが無いため、ストーリーを生成できません。プロジェクト編集から動画を追加し直してください。");
      return;
    }
    if (!isGeminiEnabled) {
      setSnackbarMessage("AI API キーが未設定です。");
      setStatus("AI API キー未設定のため、ストーリー生成は使えません。");
      return;
    }

    setIsGeneratingStory(true);
    setStatus("AI でストーリーを生成しています...");

    try {
      const centerTime = Math.max(videoDuration || 0, 1) / 2;
      const frames = await extractStoryboardFrames(
        activeVideo.file as File,
        centerTime,
        AI_STORY_SUMMARY_FRAME_COUNT,
        Math.max(videoDuration || 0.001, 1),
        AI_STORY_SUMMARY_OUTPUT_WIDTH
      );
      const response = await fetch("/api/ai/video-summary", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          videoName: activeVideo.name,
          frames: frames.map((frame) => ({
            time: frame.time,
            dataUrl: frame.dataUrl
          }))
        })
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "ストーリー生成に失敗しました。");
      }

      const sections: StorySummarySection[] = (payload.sections ?? []).map((section: StorySummarySection) => ({
        time: section.time,
        title: section.title,
        summary: section.summary
      }));

      setUploadedVideos((current) =>
        current.map((video) =>
          video.id === activeVideo.id
            ? {
                ...video,
                storySummary: sections
              }
            : video
        )
      );
      setStatus("AI でストーリーを生成しました。");
    } catch (error) {
      const message = normalizeAiErrorMessage(error);
      setStatus(message);
      setSnackbarMessage(message);
    } finally {
      setIsGeneratingStory(false);
    }
  }

  async function openStoryDetail(section: StorySummarySection) {
    const activeVideo = uploadedVideos.find((video) => video.id === currentVideoId);
    const cachedDetail = activeVideo?.storyDetails?.find(
      (detail) => isSameStoryTime(detail.time, section.time)
    );
    if (cachedDetail) {
      setStoryDetailTarget(section);
      setStoryDetailResult(cachedDetail);
      return;
    }
    if (!activeVideo?.file) {
      setSnackbarMessage("この動画は本体ファイルが無いため、構成を提案できません。");
      setStatus("この動画は本体ファイルが無いため、構成を提案できません。プロジェクト編集から動画を追加し直してください。");
      return;
    }
    if (!isGeminiEnabled) {
      setSnackbarMessage("AI API キーが未設定です。");
      setStatus("AI API キー未設定のため、構成提案は使えません。");
      return;
    }

    setStoryDetailTarget(section);
    setStoryDetailResult(null);
    setIsGeneratingStoryDetail(true);
    setStatus(`「${section.title}」の構成を AI で提案しています...`);

    try {
      const panels = await extractStoryboardFrames(
        activeVideo.file as File,
        section.time,
        AI_STORYBOARD_FRAME_COUNT,
        120,
        AI_STORYBOARD_OUTPUT_WIDTH
      );
      const response = await fetch("/api/ai/storyboard", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          peakTime: section.time,
          rangeStart: Math.max(section.time - 120, 0),
          rangeEnd: section.time + 120,
          panels: panels.map((panel) => ({
            time: panel.time,
            dataUrl: panel.dataUrl
          }))
        })
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "構成提案に失敗しました。");
      }

      const nextDetail: StorySummaryDetail = {
        title: payload.title ?? section.title,
        summary: payload.summary ?? section.summary,
        time: section.time,
        panels: panels.map((panel, index) => ({
          shot: panel,
          time: panel.time,
          title: payload.panels?.[index]?.title ?? `コマ ${index + 1}`,
          summary: payload.panels?.[index]?.summary ?? "",
          shotDirection: payload.panels?.[index]?.shotDirection ?? "",
          recommendedTelop: payload.panels?.[index]?.recommendedTelop ?? ""
        }))
      };
      setStoryDetailResult(nextDetail);
      setUploadedVideos((current) =>
        current.map((video) =>
          video.id === activeVideo.id
            ? {
                ...video,
                storyDetails: [
                  ...(video.storyDetails?.filter(
                    (detail) => !isSameStoryTime(detail.time, section.time)
                  ) ?? []),
                  nextDetail
                ]
              }
            : video
        )
      );
      setStatus(`「${section.title}」の構成提案を生成しました。`);
    } catch (error) {
      const message = normalizeAiErrorMessage(error);
      setStatus(message);
      setSnackbarMessage(message);
    } finally {
      setIsGeneratingStoryDetail(false);
    }
  }

  async function handleCreateProject() {
    if (!newProjectTitle.trim() || !newProjectFiles.length) return;

    uploadedVideosRef.current.forEach((video) => {
      URL.revokeObjectURL(video.url);
    });

    setIsCreatingProject(true);
    const nextProjectId = crypto.randomUUID();
    const nextProjectTitle = newProjectTitle.trim();
    setThreadTitle(nextProjectTitle);
    setCurrentProjectId(nextProjectId);
    setUploadedVideos([]);
    setCurrentVideoId(null);
    setCandidateShots([]);
    setCandidateGroups([]);
    setCurrentCandidateGroupId(null);
    setSelectedShots([]);
    setScenePeakSegments([]);
    setVideoUrl(null);
    setVideoName("未選択");
    setEditingShotId(null);
    setProgress(0);
    setVideoCurrentTime(0);
    setVideoDuration(0);
    setIsVideoPlaying(false);
    setStatus("動画を解析して見どころ候補を抽出しています...");

    try {
      await saveThread({
        id: nextProjectId,
        title: nextProjectTitle,
        videoName: "未選択",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        currentVideoId: null,
        videos: [],
        sceneSegments: [],
        items: []
      });
      for (const file of newProjectFiles) {
        await addUploadedVideo(file);
      }
      await saveThread(buildProjectPayload(nextProjectId, nextProjectTitle));
      const next = await getThreads();
      setSavedThreads(next);
      setNewProjectDialogOpen(false);
      setNewProjectFiles([]);
      setStatus("新しいプロジェクトを開始しました。動画を切り替えながら候補を選べます。");
    } finally {
      setIsCreatingProject(false);
    }
  }

  function openCreateProjectDialog() {
    setProjectDialogMode("create");
    setProjectDialogTargetId(null);
    setNewProjectTitle(initialProjectTitle());
    setNewProjectFiles([]);
    setNewProjectDialogOpen(true);
  }

  function openEditProjectDialog(thread: SavedThread) {
    loadThread(thread);
    setProjectDialogMode("edit");
    setProjectDialogTargetId(thread.id);
    setNewProjectTitle(thread.title);
    setNewProjectFiles([]);
    setNewProjectDialogOpen(true);
    setProjectMenuId(null);
  }

  async function handleProjectDialogSubmit() {
    if (!newProjectTitle.trim()) return;

    if (projectDialogMode === "create") {
      await handleCreateProject();
      return;
    }

    if (!currentProjectId) return;

    setIsCreatingProject(true);
    try {
      setThreadTitle(newProjectTitle.trim());
      for (const file of newProjectFiles) {
        await addUploadedVideo(file);
      }
      const project = buildProjectPayload(currentProjectId, newProjectTitle.trim());
      await saveThread(project);
      const next = await getThreads();
      setSavedThreads(next);
      setNewProjectDialogOpen(false);
      setNewProjectFiles([]);
      setStatus(`"${newProjectTitle.trim()}" を更新しました。`);
    } finally {
      setIsCreatingProject(false);
    }
  }

  function confirmDeleteExistingVideo() {
    if (!existingVideoPendingDelete || uploadedVideos.length <= 1) return;

    const deletingVideoId = existingVideoPendingDelete.id;
    const nextVideos = uploadedVideos.filter(
      (video) => video.id !== deletingVideoId
    );
    setUploadedVideos(nextVideos);
    setScenePeakSegments((current) =>
      current.filter((segment) => segment.videoId !== deletingVideoId)
    );

    if (currentVideoId === deletingVideoId) {
      const fallbackVideo = nextVideos[0];
      if (fallbackVideo) {
        selectUploadedVideo(fallbackVideo.id);
      } else {
        setCurrentVideoId(null);
        setVideoUrl(null);
        setVideoName("未選択");
        setCandidateShots([]);
      }
    }

    setStatus(`"${existingVideoPendingDelete.name}" をプロジェクトから外しました。`);
    setExistingVideoPendingDelete(null);
  }

  async function downloadAll() {
    if (!selectedShots.length) return;
    const zip = new JSZip();
    for (const shot of selectedShots) {
      const blob = await renderScreenshotWithTelop(shot);
      zip.file(`shot-${formatTimestamp(shot.time)}.jpg`, blob);
    }
    const archive = await zip.generateAsync({ type: "blob" });
    downloadBlob(archive, "project-shots.zip");
  }

  async function downloadSelectedShots() {
    if (!selectedShotIds.length) return;
    const zip = new JSZip();
    const targets = selectedShots.filter((shot) => selectedShotIds.includes(shot.id));
    for (const shot of targets) {
      const blob = await renderScreenshotWithTelop(shot);
      zip.file(`shot-${formatTimestamp(shot.time)}.jpg`, blob);
    }
    const archive = await zip.generateAsync({ type: "blob" });
    downloadBlob(archive, "selected-shots.zip");
    setStatus(`${targets.length} 件のテロップショットを書き出しました。`);
  }

  async function downloadSingleShot(shot: ScreenshotCandidate) {
    const blob = await renderScreenshotWithTelop(shot);
    downloadBlob(blob, `shot-${formatTimestamp(shot.time)}.jpg`);
    setStatus(`${formatTimestamp(shot.time)} のテロップショットを書き出しました。`);
  }

  function loadThread(thread: SavedThread) {
    setProjectMenuId(null);
    uploadedVideosRef.current.forEach((video) => {
      URL.revokeObjectURL(video.url);
    });
    const restoredVideos =
      thread.videos?.map((video) => ({
        ...video,
        url: video.file ? URL.createObjectURL(video.file) : "",
        candidateShots: video.candidateShots.map((shot) => cloneShot(shot)),
        candidateGroups:
          video.candidateGroups?.map((group) => cloneCandidateGroup(group)) ??
          [createDefaultCandidateGroup(video.candidateShots)],
        currentCandidateGroupId:
          video.currentCandidateGroupId ??
          video.candidateGroups?.[0]?.id ??
          "default",
        selectedShots: video.selectedShots.map((shot) => cloneShot(shot)),
        storySummary: video.storySummary ?? [],
        storyDetails:
          video.storyDetails?.map((detail) => ({
            ...detail,
            panels: detail.panels.map((panel) => ({
              ...panel,
              shot: cloneShot(panel.shot)
            }))
          })) ?? []
      })) ?? [];
    const restoredSceneSegments =
      thread.sceneSegments?.map((segment) => ({
        ...segment,
        thumbnailShot: cloneShot(segment.thumbnailShot)
      })) ?? [];

    setUploadedVideos(restoredVideos);
    setCurrentProjectId(thread.id);
    setCurrentVideoId(thread.currentVideoId ?? restoredVideos[0]?.id ?? null);
    setCandidateShots([]);
    setCandidateGroups([]);
    setCurrentCandidateGroupId(null);
    setSelectedShots(thread.items.map((item) => cloneShot(item)));
    setScenePeakSegments(restoredSceneSegments);
    setEditingShotId(null);
    setVideoUrl(null);
    setThreadTitle(thread.title);
    setVideoName(thread.videoName);
    setStatus(`保存済みプロジェクト "${thread.title}" を読み込みました。`);

    if (restoredVideos.length) {
      const activeVideo =
        restoredVideos.find((video) => video.id === (thread.currentVideoId ?? restoredVideos[0]?.id)) ??
        restoredVideos[0];

      if (activeVideo) {
        setVideoUrl(activeVideo.url || null);
        setVideoName(activeVideo.name);
        setCandidateGroups(activeVideo.candidateGroups);
        syncCandidateShotsFromGroup(
          activeVideo.candidateGroups,
          activeVideo.currentCandidateGroupId
        );
        setProgress(activeVideo.progress);
        setIsAnalyzing(activeVideo.isAnalyzing);
        setStatus(activeVideo.status);
      }
    }
  }

  async function confirmDeleteProject() {
    if (!projectPendingDelete) return;
    const deletingCurrentProject = currentProjectId === projectPendingDelete.id;
    await deleteThread(projectPendingDelete.id);
    const next = await getThreads();
    setSavedThreads(next);
    if (deletingCurrentProject) {
      uploadedVideosRef.current.forEach((video) => {
        URL.revokeObjectURL(video.url);
      });
      setUploadedVideos([]);
      setCurrentProjectId(null);
      setCurrentVideoId(null);
      setVideoUrl(null);
      setVideoName("未選択");
      setCandidateShots([]);
      setCandidateGroups([]);
      setCurrentCandidateGroupId(null);
      setSelectedShots([]);
      setScenePeakSegments([]);
      setEditingShotId(null);
      setProgress(0);
      setIsAnalyzing(false);
      setVideoCurrentTime(0);
      setVideoDuration(0);
      setIsVideoPlaying(false);
    }
    setStatus(`"${projectPendingDelete.title}" を削除しました。`);
    setProjectPendingDelete(null);
  }

  function confirmDeleteSelectedShots() {
    if (!selectedShotIds.length) return;
    setSelectedShots((current) =>
      current.filter((shot) => !selectedShotIds.includes(shot.id))
    );
    if (editingShotId && selectedShotIds.includes(editingShotId)) {
      setEditingShotId(null);
    }
    setStatus(`${selectedShotIds.length} 件のテロップショットを削除しました。`);
    setSelectedShotIds([]);
    setBulkDeleteShotsOpen(false);
    setIsSelectingShots(false);
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-[1880px]">
      <section className="grid min-h-screen xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="xl:sticky xl:top-0 xl:self-start">
          <div className="flex h-full flex-col border-r border-white/6 px-2 py-4 xl:min-h-screen">
            <div className="px-3 py-3">
              <NextImage
                src="/logo.svg"
                alt="TelopShot"
                width={110}
                height={31}
                className="h-auto w-[110px]"
                priority
              />
            </div>

            <Dialog
              open={newProjectDialogOpen}
              onOpenChange={(open) => {
                setNewProjectDialogOpen(open);
                if (!open) {
                  setNewProjectFiles([]);
                  setProjectDialogTargetId(null);
                }
              }}
            >
              <Button
                type="button"
                variant="secondary"
                className="mt-4 w-full justify-start"
                onClick={openCreateProjectDialog}
              >
                <Plus className="mr-2 h-4 w-4" />
                新しいプロジェクト
              </Button>
              <DialogContent className="max-w-xl">
                <DialogHeader>
                  <DialogTitle>
                    {projectDialogMode === "create" ? "新しいプロジェクト" : "プロジェクトを編集"}
                  </DialogTitle>
                  <DialogDescription>
                    {projectDialogMode === "create"
                      ? "プロジェクト名を決めて、編集したい動画をまとめて追加します。"
                      : "プロジェクト名の変更と動画の追加ができます。"}
                  </DialogDescription>
                </DialogHeader>
                <form
                  className="space-y-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void handleProjectDialogSubmit();
                  }}
                >
                  <div className="space-y-2">
                    <Label htmlFor="new-project-title">プロジェクト名</Label>
                    <Input
                      id="new-project-title"
                      value={newProjectTitle}
                      onChange={(event) => setNewProjectTitle(event.target.value)}
                      className="bg-[#2b2d33] text-white placeholder:text-white/30"
                    />
                  </div>
                  <div className="space-y-3">
                    {projectDialogMode === "edit" ? (
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-foreground">
                          追加済みの動画
                        </p>
                        <div className="space-y-2 rounded-xl border border-dashed border-border p-4">
                          {uploadedVideos.length ? (
                            uploadedVideos.map((video) => (
                              <div
                                key={video.id}
                                className="flex items-center justify-between gap-3 rounded-lg bg-white/5 px-3 py-2"
                              >
                                <div className="min-w-0">
                                  <p className="truncate text-sm text-foreground">
                                    {video.name}
                                  </p>
                                  <p className="text-[11px] text-muted-foreground">
                                    {video.candidateShots.length
                                      ? `${video.candidateShots.length}件候補`
                                      : video.isAnalyzing
                                        ? "解析中..."
                                        : "候補未抽出"}
                                  </p>
                                </div>
                                {uploadedVideos.length > 1 ? (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => setExistingVideoPendingDelete(video)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                ) : null}
                              </div>
                            ))
                          ) : (
                            <div className="rounded-lg border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
                              まだ動画が追加されていません。
                            </div>
                          )}
                        </div>
                      </div>
                    ) : null}
                    <input
                      ref={newProjectFileInputRef}
                      type="file"
                      accept="video/*"
                      multiple
                      className="sr-only"
                      onChange={handleNewProjectFiles}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      className="w-full justify-center"
                      onClick={() => newProjectFileInputRef.current?.click()}
                    >
                      <Clapperboard className="mr-2 h-4 w-4" />
                      {projectDialogMode === "create" ? "動画を追加" : "動画を追加でアップロード"}
                    </Button>
                    <div className="space-y-2 rounded-xl border border-dashed border-border p-4">
                      {newProjectFiles.length ? (
                        newProjectFiles.map((file, index) => (
                          <div
                            key={`${file.name}-${file.lastModified}-${index}`}
                            className="flex items-center justify-between gap-3 rounded-lg bg-white/5 px-3 py-2"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm text-foreground">{file.name}</p>
                              <p className="text-[11px] text-muted-foreground">
                                {(file.size / 1024 / 1024).toFixed(1)} MB
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              className="h-8 px-2 text-muted-foreground hover:text-foreground"
                              onClick={() => removeNewProjectFile(index)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-lg border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
                          まだ動画が追加されていません。動画は何個でも追加できます。
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-end gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setNewProjectDialogOpen(false)}
                    >
                      キャンセル
                    </Button>
                    <Button
                      type="submit"
                      disabled={
                        isCreatingProject ||
                        !newProjectTitle.trim() ||
                        (projectDialogMode === "create" && !newProjectFiles.length)
                      }
                    >
                      {isCreatingProject ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      OK
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>

            <div className="mt-4 space-y-1">
              <p className="px-2 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                プロジェクト
              </p>
              <ScrollArea className="h-[360px] pr-1">
                <div className="space-y-1">
                  {savedThreads.length ? (
                    savedThreads.map((thread) => (
                      <div
                        key={thread.id}
                        className={`group relative grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 rounded-xl px-2 py-3 transition ${
                          currentProjectId === thread.id ? "bg-white/6" : "hover:bg-white/4"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => loadThread(thread)}
                          disabled={currentProjectId === thread.id}
                          className={`flex min-w-0 flex-1 items-start gap-3 text-left ${
                            currentProjectId === thread.id
                              ? "cursor-default"
                              : "cursor-pointer"
                          }`}
                        >
                          <div className="mt-0.5 text-muted-foreground">
                            {currentProjectId === thread.id ? (
                              <CheckCircle2 className="h-4 w-4 text-foreground" />
                            ) : (
                              <Circle className="h-4 w-4" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-foreground">
                              {thread.title}
                            </p>
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              {new Date(thread.updatedAt ?? thread.createdAt).toLocaleString("ja-JP")}
                            </p>
                          </div>
                        </button>
                        <div
                          ref={projectMenuId === thread.id ? projectMenuLayerRef : null}
                          className="relative mt-0.5 self-start"
                        >
                          <button
                            type="button"
                            aria-label={`${thread.title} のメニューを開く`}
                            onClick={(event) => {
                              event.stopPropagation();
                              setProjectMenuId((current) =>
                                current === thread.id ? null : thread.id
                              );
                            }}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-foreground/80 transition hover:bg-white/10 hover:text-foreground"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                          {projectMenuId === thread.id ? (
                            <div className="absolute right-0 top-10 z-20 w-32 rounded-lg border border-white/10 bg-[#1c2029] p-1 shadow-2xl">
                              <button
                                type="button"
                                onClick={() => openEditProjectDialog(thread)}
                                className="flex w-full items-center gap-2 rounded-md border border-transparent px-3 py-2 text-sm text-foreground/90 transition hover:border-white/10 hover:bg-white/10 hover:text-white active:bg-white/14"
                              >
                                <Pencil className="h-4 w-4" />
                                編集
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setProjectPendingDelete(thread);
                                  setProjectMenuId(null);
                                }}
                                className="flex w-full items-center gap-2 rounded-md border border-transparent px-3 py-2 text-sm text-foreground/90 transition hover:border-white/10 hover:bg-white/10 hover:text-white active:bg-white/14"
                              >
                                <Trash2 className="h-4 w-4" />
                                削除
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
                      まだ保存済みプロジェクトはありません。
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>

            <div className="mt-auto pt-4 space-y-2">
              <div className="flex items-center justify-between px-2">
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                  ステータス
                </p>
                <span className="text-[11px] text-muted-foreground">
                  {Math.round(progress * 100)}%
                </span>
              </div>
              <div className="px-2">
                <p className="text-xs leading-5 text-muted-foreground">{status}</p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/8">
                  <div
                    className="h-full rounded-full bg-white transition-all"
                    style={{ width: `${Math.round(progress * 100)}%` }}
                  />
                </div>
              </div>
            </div>

          </div>
        </aside>

        <div className="space-y-5 px-4 py-4 md:px-6 xl:px-8">
          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,680px)_minmax(0,1fr)]">
            <Card className="w-full overflow-hidden">
              <CardContent className="p-5">
                <div className="space-y-5">
                  {/* プロジェクト名 */}
                  <CardTitle className="flex items-center gap-2 text-base font-semibold">
                    <Clapperboard className="h-5 w-5 text-primary" />
                    {threadTitle}
                  </CardTitle>
                  {/* 動画選択 */}
                  {currentProjectId ? (
                    <div className="flex flex-wrap gap-2">
                      {uploadedVideos.length ? (
                        uploadedVideos.map((video) => {
                          const isActive = currentVideoId === video.id;
                          return (
                            <button
                              key={video.id}
                              type="button"
                              onClick={() => selectUploadedVideo(video.id)}
                              className={`flex min-w-[180px] items-start gap-3 rounded-xl border px-3 py-3 text-left transition ${
                                isActive
                                  ? "border-white/20 bg-white/8"
                                  : "border-white/10 bg-white/5 hover:bg-white/8"
                              }`}
                            >
                              <div className="mt-0.5 text-muted-foreground">
                                {isActive ? (
                                  <CheckCircle2 className="h-4 w-4 text-foreground" />
                                ) : (
                                  <Circle className="h-4 w-4" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-sm text-foreground">
                                  {video.name}
                                </p>
                              </div>
                            </button>
                          );
                        })
                      ) : (
                        <div className="rounded-xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
                          まだ動画が追加されていません。
                        </div>
                      )}
                    </div>
                  ) : null}
                  {/* タブ切替 */}
                  <div className="flex border-b border-white/10">
                    {([
                      { key: "preview" as const, label: "動画プレビュー" },
                      { key: "highlights" as const, label: "ストーリー" },
                      { key: "scene-selection" as const, label: "シーン選定" }
                    ]).map(({ key, label }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setCenterTab(key)}
                        className={`relative px-4 py-4 text-sm font-medium transition ${
                          centerTab === key
                            ? "text-white"
                            : "text-white/45 hover:text-white/70"
                        }`}
                      >
                        {label}
                        {centerTab === key && (
                          <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full bg-primary" />
                        )}
                      </button>
                    ))}
                  </div>

                {centerTab === "preview" ? (
                <div className="max-w-[640px] space-y-8">
                  <section className="space-y-4">
                    <div className="overflow-hidden rounded-xl border border-white/10 bg-white/5">
                      <div className="overflow-hidden border-b border-white/10 bg-black/30">
                        {videoUrl ? (
                          <video
                            ref={videoRef}
                            src={videoUrl}
                            className="aspect-video w-full object-contain"
                            onLoadedMetadata={handleLoadedMetadata}
                            onTimeUpdate={handleVideoTimeUpdate}
                            onPlay={() => setIsVideoPlaying(true)}
                            onPause={() => setIsVideoPlaying(false)}
                            playsInline
                          />
                        ) : (
                          <div className="flex aspect-video items-center justify-center text-sm text-muted-foreground">
                            動画をアップロードすると、ここでシークと手動キャプチャができます。
                          </div>
                        )}
                      </div>
                      <div className="grid gap-3 p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            type="button"
                            onClick={() => nudgeVideo(-1)}
                            disabled={!videoUrl}
                            aria-label="1秒戻る"
                          >
                            <SkipBack className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            type="button"
                            onClick={togglePlayback}
                            disabled={!videoUrl}
                            aria-label={isVideoPlaying ? "停止" : "再生"}
                          >
                            {isVideoPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            type="button"
                            onClick={() => nudgeVideo(1)}
                            disabled={!videoUrl}
                            aria-label="1秒進む"
                          >
                            <SkipForward className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="secondary"
                            type="button"
                            onClick={captureCurrentFrame}
                            disabled={!videoUrl}
                            className="ml-auto"
                          >
                            <Plus className="mr-2 h-4 w-4" />
                            テロップショットに追加
                          </Button>
                        </div>
                        <div className="space-y-2">
                          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
                            <span>{formatTimestamp(videoCurrentTime)}</span>
                            <div className="relative w-full">
                              <div
                                ref={seekBarRef}
                                role="slider"
                                aria-label="シークバー"
                                aria-valuemin={0}
                                aria-valuemax={videoDuration || 0}
                                aria-valuenow={videoCurrentTime}
                                tabIndex={videoUrl ? 0 : -1}
                                onPointerDown={handleSeekPointerDown}
                                onPointerMove={handleSeekPointerMove}
                                onPointerUp={handleSeekPointerUp}
                                onPointerCancel={handleSeekPointerCancel}
                                className={`relative h-6 w-full ${videoUrl ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}
                              >
                                <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-white/10" />
                                <div
                                  className="absolute left-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-white/65"
                                  style={{
                                    width: `${videoDuration ? (videoCurrentTime / videoDuration) * 100 : 0}%`
                                  }}
                                />
                                <div
                                  className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border border-white/50 bg-white shadow-[0_2px_12px_rgba(255,255,255,0.18)]"
                                  style={{
                                    left: `calc(${videoDuration ? (videoCurrentTime / videoDuration) * 100 : 0}% - 8px)`
                                  }}
                                />
                              </div>
                            </div>
                            <span>{formatTimestamp(videoDuration)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* ショット一覧（動画プレビュータブ内） */}
                  <section className="space-y-4">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-base font-semibold">
                        <Sparkles className="h-5 w-5 text-primary" />
                        ショット一覧
                      </CardTitle>
                      <CardDescription className="mt-2">
                        自動抽出されたショットから、必要なものをテロップショットへ追加します。
                      </CardDescription>
                    </div>
                    {/* タブ */}
                    <div className="flex items-center border-b border-white/10">
                      {candidateGroups.map((group) => (
                        <button
                          key={group.id}
                          type="button"
                          onClick={() => syncCandidateShotsFromGroup(candidateGroups, group.id)}
                          className={`relative flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition ${
                            currentCandidateGroupId === group.id
                              ? "text-white"
                              : "text-white/45 hover:text-white/70"
                          }`}
                        >
                          {group.label}
                          {group.id !== "default" && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                const next = candidateGroups.filter((g) => g.id !== group.id);
                                setCandidateGroups(next);
                                if (currentCandidateGroupId === group.id) {
                                  syncCandidateShotsFromGroup(next, "default");
                                }
                              }}
                              className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full text-white/30 transition hover:bg-white/10 hover:text-white"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                          {currentCandidateGroupId === group.id && (
                            <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full bg-primary" />
                          )}
                        </button>
                      ))}
                      <button
                        type="button"
                        title="フィルタを追加"
                        onClick={() => setShotFilterDialogOpen(true)}
                        disabled={!isGeminiEnabled || !candidateGroups.length}
                        className="ml-1 flex h-7 w-7 items-center justify-center rounded-md text-white/40 transition hover:bg-white/10 hover:text-white disabled:opacity-30"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                        {candidateShots.map((shot, index) => {
                          return (
                            <div
                              key={shot.id}
                              className="group relative overflow-hidden border border-white/10 bg-white/5 text-left transition hover:bg-white/10"
                            >
                              <button
                                type="button"
                                aria-label={`候補 ${index + 1} をテロップショットに追加`}
                                onClick={() => addSelectedShot(shot)}
                                className="relative block w-full text-left"
                              >
                                <img
                                  src={shot.dataUrl}
                                  alt={`候補 ${index + 1}`}
                                  className="aspect-video w-full object-cover"
                                />
                                <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/20">
                                  <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/25 bg-black/45 text-white opacity-0 transition group-hover:opacity-100">
                                    <Plus className="h-5 w-5" />
                                  </div>
                                </div>
                              </button>
                              <div className="flex items-center justify-between gap-2 p-2">
                                <button
                                  type="button"
                                  title="プレビューに移動"
                                  onClick={() => seekToShotTime(shot.time)}
                                  className="rounded-md px-2 py-0.5 text-[10px] text-muted-foreground transition hover:bg-white/10 hover:text-white"
                                >
                                  {formatTimestamp(shot.time)}
                                </button>
                                <button
                                  type="button"
                                  title="近いショットを選ぶ"
                                  onClick={() => void openNearbyShotsDialog(shot)}
                                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-white/10 hover:text-white"
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                        {!candidateShots.length && (
                          <div className="col-span-full rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                            動画をアップロードすると候補一覧が表示されます。
                          </div>
                        )}
                    </div>
                  </section>
                </div>
                  ) : centerTab === "highlights" ? (
                    <div className="max-w-[840px] space-y-6">
                      <section className="space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <CardTitle className="text-base font-semibold">ストーリー</CardTitle>
                            <CardDescription className="mt-2">
                              AI で動画全体の流れを読み取り、尺の位置つきで要約します。
                            </CardDescription>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => void generateStorySummary()}
                            disabled={!currentVideoId || !isGeminiEnabled || isGeneratingStory}
                          >
                            {isGeneratingStory ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                生成中
                              </>
                            ) : (
                              "ストーリーを生成"
                            )}
                          </Button>
                        </div>
                        {!currentVideoId ? (
                          <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                            まずプロジェクト内の動画を選択してください。
                          </div>
                        ) : !isGeminiEnabled ? (
                          <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                            AI API キー未設定のため、ストーリー生成は使えません。
                          </div>
                        ) : currentStorySummary.length ? (
                          <div className="space-y-3">
                            {currentStorySummary.map((section, index) => (
                              <div
                                key={`${section.time}-${index}`}
                                className="rounded-xl border border-white/10 bg-white/5 px-4 py-4"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <button
                                    type="button"
                                    onClick={() => void openStoryDetail(section)}
                                    className="min-w-0 flex-1 text-left transition hover:opacity-90"
                                  >
                                    <p className="text-sm font-semibold text-white">{section.title}</p>
                                    <p className="mt-2 text-sm leading-6 text-white/65">{section.summary}</p>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => seekToShotTime(section.time)}
                                    className="shrink-0 rounded-md px-2 py-0.5 text-[10px] text-muted-foreground transition hover:bg-white/10 hover:text-white"
                                    title="プレビューに移動"
                                  >
                                    {formatTimestamp(section.time)}
                                  </button>
                                </div>
                                <div className="mt-3">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => void openStoryDetail(section)}
                                  >
                                    構成を提案
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                            ストーリーを生成すると、動画の流れを尺の位置つきで一覧表示します。
                          </div>
                        )}
                      </section>
                    </div>
                  ) : (
                    <div className="max-w-[840px] space-y-6">
                      <section className="space-y-4">
                        <div className="space-y-2">
                          <CardTitle className="text-base font-semibold">シーン選定</CardTitle>
                          <CardDescription>
                            選択中の動画から、ローカル処理で音量ピークの大きい盛り上がりシーンを 5 件一覧で表示します。
                          </CardDescription>
                        </div>
                        {currentVideoId ? (
                          <p className="text-sm text-muted-foreground">対象: {videoName}</p>
                        ) : null}
                        {!uploadedVideos.length ? (
                          <div className="rounded-xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
                            まずプロジェクトに動画を追加してください。
                          </div>
                        ) : null}
                        {currentVideoId && !canAnalyzeCurrentSceneSelectionVideo ? (
                          <p className="text-xs text-white/45">
                            この動画は本体ファイルが残っていないため再解析できません。プロジェクト編集から動画を追加し直してください。
                          </p>
                        ) : null}
                        {isGeneratingSceneSelection ? (
                          <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                            <div className="flex items-center gap-2">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              音量ピークの大きい盛り上がりシーンを 5 件検出しています。
                            </div>
                          </div>
                        ) : visibleScenePeakSegments.length ? (
                          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                            {visibleScenePeakSegments.map((segment, index) => (
                              <div
                                key={segment.id}
                                className="group relative overflow-hidden border border-white/10 bg-white/5 text-left transition hover:bg-white/10"
                              >
                                <button
                                  type="button"
                                  onClick={() => setScenePreviewSegment(segment)}
                                  className="block w-full text-left"
                                  aria-label={`盛り上がりシーン ${index + 1} を再生`}
                                >
                                  <img
                                    src={segment.thumbnailShot.dataUrl}
                                    alt={`盛り上がり候補 ${index + 1}`}
                                    className="aspect-video w-full object-cover"
                                  />
                                </button>
                                <div className="flex items-center justify-between gap-2 p-2">
                                  <button
                                    type="button"
                                    title="プレビューに移動"
                                    onClick={() => seekToShotTime(segment.peakTime)}
                                    className="rounded-md px-2 py-0.5 text-[10px] text-muted-foreground transition hover:bg-white/10 hover:text-white"
                                  >
                                    {formatTimestamp(segment.peakTime)}
                                  </button>
                                  <button
                                    type="button"
                                    title="再生する"
                                    onClick={() => setScenePreviewSegment(segment)}
                                    className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-white/10 hover:text-white"
                                  >
                                    <Play className="h-4 w-4" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                            選択中の動画から、音量ピークの大きい盛り上がりシーンを 5 件一覧で表示します。
                          </div>
                        )}
                      </section>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <section className="relative space-y-4 xl:sticky xl:top-4 xl:max-h-[calc(100vh-48px)] xl:self-stretch xl:overflow-y-auto xl:px-4 xl:py-2 xl:before:absolute xl:before:bottom-0 xl:before:left-0 xl:before:top-0 xl:before:w-px xl:before:bg-white/6">
              {/* ── コミュニティテンプレート ── */}
              <div className="space-y-3 px-2 pb-4">
                <div className="flex items-center gap-2 px-1">
                  <LayoutGrid className="h-5 w-5 text-primary" />
                  <h3 className="text-base font-semibold text-white">コミュニティテンプレート</h3>
                </div>
                <div className="space-y-3">
                  {snsTemplates.filter((t) => t.projectId === currentProjectId || (!t.projectId && !currentProjectId)).map((template) => (
                    <div
                      key={template.id}
                      className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3 transition hover:bg-white/10"
                    >
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        onClick={() => {
                          setEditingSnsTemplate(template);
                          setSnsTemplateDialogOpen(true);
                        }}
                      >
                        <LayoutGrid className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-white">{template.name || "無題のテンプレート"}</p>
                          <p className="text-[11px] text-muted-foreground">{{ youtube: "Youtube", instagram: "Instagram", tiktok: "TikTok", x: "X" }[template.platform ?? "youtube"]}</p>
                        </div>
                      </button>
                      <button
                        type="button"
                        title="削除"
                        onClick={() => setSnsTemplateDeleteTarget(template)}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-red-500/20 hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 p-4 text-sm text-muted-foreground transition hover:border-white/40 hover:text-white"
                    onClick={() => {
                      const now = new Date();
                      const defaultName = `Slide ${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
                      setSnsNewName(defaultName);
                      setSnsNewPlatform("youtube");
                      setSnsNewNameDialogOpen(true);
                    }}
                  >
                    <Plus className="h-4 w-4" />
                    新規作成
                  </button>
                </div>
              </div>

              {/* ── テロップショット ── */}
              <Separator className="mx-2" />
              <div className="space-y-3 px-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="flex items-center gap-2 text-base font-semibold">
                      <Type className="h-5 w-5 text-primary" />
                      テロップショット
                    </CardTitle>
                    <CardDescription className="mt-2">
                      採用したショットだけを保持し、クリックで個別にテロップ編集します。
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    type="button"
                    size="sm"
                    className="shrink-0"
                    onClick={() => {
                      if (isSelectingShots) {
                        setIsSelectingShots(false);
                        return;
                      }
                      setIsSelectingShots(true);
                    }}
                    disabled={!selectedShots.length}
                  >
                    {isSelectingShots ? "キャンセル" : "編集"}
                  </Button>
                </div>
                {isSelectingShots ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      type="button"
                      onClick={toggleSelectAllShots}
                      disabled={!selectedShots.length}
                    >
                      {selectedShots.length > 0 && selectedShotIds.length === selectedShots.length
                        ? "すべて外す"
                        : "すべて選択"}
                    </Button>
                    <Button
                      variant="outline"
                      type="button"
                      onClick={() => setBulkDeleteShotsOpen(true)}
                      disabled={!selectedShotIds.length}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      選択を削除
                    </Button>
                    <Button
                      variant="outline"
                      type="button"
                      onClick={() => void downloadSelectedShots()}
                      disabled={!selectedShotIds.length}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      選択をダウンロード
                    </Button>
                  </div>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-3 px-2 xl:grid-cols-[repeat(auto-fill,minmax(180px,180px))]">
                {selectedShots.map((shot, index) => (
                  <div
                    key={shot.id}
                    className="group relative overflow-hidden border border-white/10 bg-white/5"
                  >
                        {isSelectingShots ? (
                          <button
                            type="button"
                            aria-label={`Shot ${index + 1} を選択`}
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleSelectedShotId(shot.id);
                            }}
                            className="absolute left-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-md bg-black/55 text-white transition hover:bg-black/70"
                          >
                            {selectedShotIds.includes(shot.id) ? (
                              <CheckCircle2 className="h-4 w-4" />
                            ) : (
                              <Circle className="h-4 w-4" />
                            )}
                          </button>
                        ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        if (isSelectingShots) {
                          toggleSelectedShotId(shot.id);
                          return;
                        }
                        setEditingShotId(shot.id);
                      }}
                      className="w-full text-left"
                    >
                      <div className="relative">
                        <img
                          src={selectedShotPreviewMap[shot.id] ?? shot.dataUrl}
                          alt={`採用 ${index + 1}`}
                          className="aspect-video w-full object-cover"
                        />
                        {!isSelectingShots ? (
                          <div className="absolute right-2 top-2 z-10 flex gap-2 opacity-0 transition group-hover:opacity-100">
                            <button
                              type="button"
                              title="ダウンロード"
                              onClick={(event) => {
                                event.stopPropagation();
                                void downloadSingleShot(shot);
                              }}
                              className="flex h-8 w-8 items-center justify-center rounded-md bg-black/60 text-white transition hover:bg-black/80"
                            >
                              <Download className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              title="削除"
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelectedShotIds([shot.id]);
                                setBulkDeleteShotsOpen(true);
                              }}
                              className="flex h-8 w-8 items-center justify-center rounded-md bg-black/60 text-white transition hover:bg-black/80"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ) : null}
                      </div>
                      <div className="space-y-1 p-2">
                        <p className="text-sm font-semibold text-foreground">
                          Shot {index + 1}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {formatTimestamp(shot.time)}
                        </p>
                      </div>
                    </button>
                  </div>
                ))}
                {!selectedShots.length && (
                  <div className="col-span-full w-full rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                    候補にチェックを入れるか、動画プレビューから手動でスクショを追加してください。
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </section>

      {/* ── ショットフィルタ条件ダイアログ ── */}
      <Dialog open={shotFilterDialogOpen} onOpenChange={(open) => { if (!open) setShotFilterDialogOpen(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>フィルタ条件を選択</DialogTitle>
            <DialogDescription>AIがショットを分析して、条件に合うものだけを表示します。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-3">
              <Label className="text-sm font-semibold text-white">テロップの有無</Label>
              <div className="flex gap-2">
                {([
                  { value: "telop-no", label: "テロップなし" },
                  { value: "telop-yes", label: "テロップあり" }
                ]).map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => { setShotFilterType("telop"); setShotFilterValue(value); }}
                    className={`flex-1 rounded-lg border px-3 py-2.5 text-xs font-medium transition ${
                      shotFilterType === "telop" && shotFilterValue === value
                        ? "border-white/30 bg-white/15 text-white"
                        : "border-white/10 text-white/50 hover:border-white/20 hover:text-white/70"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <Separator />
            <div className="space-y-3">
              <Label className="text-sm font-semibold text-white">人物の数</Label>
              <div className="flex gap-2">
                {([
                  { value: "person-1", label: "1人" },
                  { value: "person-2", label: "2人" },
                  { value: "person-more", label: "それ以上" }
                ]).map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => { setShotFilterType("person-count"); setShotFilterValue(value); }}
                    className={`flex-1 rounded-lg border px-3 py-2.5 text-xs font-medium transition ${
                      shotFilterType === "person-count" && shotFilterValue === value
                        ? "border-white/30 bg-white/15 text-white"
                        : "border-white/10 text-white/50 hover:border-white/20 hover:text-white/70"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setShotFilterDialogOpen(false)}>キャンセル</Button>
            <Button
              size="sm"
              disabled={isFilteringShots}
              onClick={async () => {
                const defaultGroup = candidateGroups.find((g) => g.id === "default");
                if (!defaultGroup?.shots.length) return;
                setIsFilteringShots(true);
                try {
                  const res = await fetch("/api/ai/shot-filter", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      frames: defaultGroup.shots.map((s) => ({ id: s.id, dataUrl: s.dataUrl }))
                    })
                  });
                  if (!res.ok) {
                    const err = await res.json();
                    setSnackbarMessage(err.error ?? "フィルタに失敗しました。");
                    return;
                  }
                  const data = await res.json() as {
                    results: Array<{ id: string; hasTelop: boolean; personCount: number }>;
                  };
                  const filtered = defaultGroup.shots.filter((shot) => {
                    const r = data.results.find((x) => x.id === shot.id);
                    if (!r) return false;
                    if (shotFilterType === "telop") {
                      return shotFilterValue === "telop-yes" ? r.hasTelop : !r.hasTelop;
                    }
                    if (shotFilterType === "person-count") {
                      if (shotFilterValue === "person-1") return r.personCount === 1;
                      if (shotFilterValue === "person-2") return r.personCount === 2;
                      return r.personCount >= 3;
                    }
                    return true;
                  });
                  const labelMap: Record<string, string> = {
                    "telop-no": "テロップなし",
                    "telop-yes": "テロップあり",
                    "person-1": "1人",
                    "person-2": "2人",
                    "person-more": "3人以上"
                  };
                  const newGroup: CandidateGroup = {
                    id: `filter-${crypto.randomUUID()}`,
                    label: labelMap[shotFilterValue] ?? shotFilterValue,
                    conditions: null,
                    shots: filtered.map((s) => cloneShot(s))
                  };
                  const nextGroups = [...candidateGroups, newGroup];
                  setCandidateGroups(nextGroups);
                  syncCandidateShotsFromGroup(nextGroups, newGroup.id);
                  setShotFilterDialogOpen(false);
                  setSnackbarMessage(`${labelMap[shotFilterValue]}: ${filtered.length}件のショットが見つかりました。`);
                } catch {
                  setSnackbarMessage("フィルタ処理中にエラーが発生しました。");
                } finally {
                  setIsFilteringShots(false);
                }
              }}
            >
              {isFilteringShots ? (
                <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />検出中...</>
              ) : (
                "検出"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── コミュニティテンプレート新規作成ダイアログ ── */}
      <Dialog open={snsNewNameDialogOpen} onOpenChange={(open) => { if (!open) setSnsNewNameDialogOpen(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>新しいスライド</DialogTitle>
            <DialogDescription>スライド名とSNSの種別を選択してください。</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            const name = snsNewName.trim();
            if (!name) return;
            const newTemplate: SnsTemplate = {
              id: `sns-${crypto.randomUUID()}`,
              projectId: currentProjectId,
              name,
              platform: snsNewPlatform,
              slides: Array.from({ length: 5 }, (_, i) => ({
                id: `slide-${crypto.randomUUID()}`,
                headerLine1: i === 0 ? "" : undefined,
                headerLine2: i === 0 ? "" : undefined,
                layout: "two-horizontal" as SnsLayoutType,
                slots: [null, null]
              })),
              createdAt: new Date().toISOString()
            };
            setSnsTemplates((prev) => [...prev, newTemplate]);
            void saveSnsTemplate(newTemplate);
            setSnsNewNameDialogOpen(false);
            setSnackbarMessage(`「${name}」を作成しました。`);
          }}>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">スライド名</Label>
                <Input
                  value={snsNewName}
                  onChange={(e) => setSnsNewName(e.target.value)}
                  placeholder="スライド名"
                  className="bg-[#2b2d33] text-white placeholder:text-white/30 ring-inset focus-visible:ring-inset"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">SNS 種別</Label>
                <Select value={snsNewPlatform} onValueChange={(v) => setSnsNewPlatform(v as SnsPlatform)}>
                  <SelectTrigger className="h-10 w-full rounded-md bg-[#2b2d33] text-white focus:ring-inset">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="youtube">Youtube</SelectItem>
                    <SelectItem value="instagram">Instagram</SelectItem>
                    <SelectItem value="tiktok">TikTok</SelectItem>
                    <SelectItem value="x">X (Twitter)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" type="button" onClick={() => setSnsNewNameDialogOpen(false)}>キャンセル</Button>
              <Button size="sm" type="submit" disabled={!snsNewName.trim()}>OK</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── コミュニティテンプレート編集ダイアログ ── */}
      <Dialog open={snsTemplateDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setSnsTemplateDialogOpen(false);
        }
      }}>
        <DialogContent className="flex max-h-[calc(100vh-80px)] max-w-6xl flex-col overflow-hidden" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>
              <input
                type="text"
                value={editingSnsTemplate?.name ?? ""}
                onChange={(e) => {
                  if (!editingSnsTemplate) return;
                  setEditingSnsTemplate({ ...editingSnsTemplate, name: e.target.value });
                }}
                placeholder="スライド名を入力"
                className="w-full bg-transparent text-lg font-semibold text-white outline-none placeholder:text-white/30 focus:border-b focus:border-white/20"
              />
            </DialogTitle>
            <DialogDescription>スライドを編集すると自動保存されます。</DialogDescription>
          </DialogHeader>
          {editingSnsTemplate && (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex-1 space-y-6 overflow-y-auto pb-4">
              <div className="grid grid-cols-3 gap-4">
                {editingSnsTemplate.slides.map((slide, slideIndex) => {
                  const isFirstSlide = slideIndex === 0;
                  const slotCount = isFirstSlide ? 2 : slide.layout === "single" ? 1 : 2;

                  const renderSlotInteractive = (si: number, extraClass: string) => {
                    const shotId = slide.slots[si] ?? null;
                    const shot = shotId ? (selectedShots.find((s) => s.id === shotId) ?? snsShotPool[shotId] ?? null) : null;
                    const hasEditedTelop = shot?.telops?.some((t) => !isTelopDefault(t)) ?? false;
                    const previewUrl = shot ? (hasEditedTelop ? (selectedShotPreviewMap[shot.id] || shot.dataUrl) : shot.dataUrl) : null;
                    return (
                      <div
                        key={si}
                        className={`group/slot relative cursor-pointer overflow-hidden border border-dashed border-white/[0.3] transition hover:bg-white/8 ${extraClass}`}
                        onClick={() => {
                          if (!shot) { setSnsSlotPickerTarget({ slideIndex, slotIndex: si }); return; }
                          const pad = 0.015, gap = 0.02, inner = 1 - pad * 2;
                          let sw: number, sh: number;
                          if (isFirstSlide) { sw = inner; sh = (inner - 0.18 - gap) / 2; }
                          else if (slide.layout === "two-horizontal") { sw = inner; sh = (inner - gap) / 2; }
                          else { sw = inner; sh = inner; }
                          const cropRatio = sw / sh;
                          setSnsTelopEditCropRatio(cropRatio);
                          // テロップ初期位置をオーバーレイ下端の10%上に
                          const shotRatio = shot.width / shot.height;
                          if (cropRatio >= shotRatio) {
                            const visibleH = shotRatio / cropRatio * 100;
                            const darkH = (100 - visibleH) / 2;
                            const telopY = (100 - darkH) - 10;
                            const telops = shot.telops?.length ? shot.telops : [createTelopItem()];
                            const needsUpdate = telops.some((t) => t.y === 90 && t.text === defaultTelop.text);
                            if (needsUpdate) {
                              updateShotInPools(shot.id, (s) => ({
                                ...s,
                                telops: (s.telops?.length ? s.telops : telops).map((t) =>
                                  t.y === 90 && t.text === defaultTelop.text ? { ...t, y: telopY } : t
                                )
                              }));
                            }
                          }
                          setEditingShotId(shot.id);
                        }}
                      >
                        {previewUrl ? <img src={previewUrl} alt="" className="absolute inset-0 h-full w-full object-cover" /> : null}
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 bg-black/0 transition group-hover/slot:bg-black/30">
                          <button type="button" title="ショットを追加" onClick={(e) => { e.stopPropagation(); setSnsSlotPickerTarget({ slideIndex, slotIndex: si }); }} className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full border border-white/25 bg-black/45 text-white opacity-0 transition hover:bg-black/70 group-hover/slot:opacity-100">
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                          {shot && (
                            <button type="button" title="削除" onClick={(e) => {
                              e.stopPropagation();
                              if (!editingSnsTemplate) return;
                              const updated = { ...editingSnsTemplate };
                              updated.slides = [...updated.slides];
                              const sl = { ...updated.slides[slideIndex] };
                              sl.slots = [...sl.slots];
                              sl.slots[si] = null;
                              updated.slides[slideIndex] = sl;
                              setEditingSnsTemplate(updated);
                            }} className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full border border-white/25 bg-black/45 text-white opacity-0 transition hover:bg-red-500/80 group-hover/slot:opacity-100">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  };

                  return (
                    <div key={slide.id} className="space-y-2">
                      <p className="text-center text-xs font-medium text-muted-foreground">{slideIndex + 1} 枚目</p>
                      <div className="relative aspect-square overflow-hidden rounded-xl border border-white/10" style={{ backgroundColor: "#000000" }}>
                        {/* 1枚目: ヘッダー + 上下2分割 */}
                        {isFirstSlide && (
                          <div className="flex h-full flex-col p-[1.5%]" style={{ containerType: "inline-size" }}>
                            <div className="flex h-[18%] shrink-0 flex-col items-center justify-center" style={{ lineHeight: 1.15 }}>
                              <div className="group/h1 relative w-full focus-within:z-10">
                                <input
                                  type="text"
                                  value={slide.headerLine1 ?? ""}
                                  onChange={(e) => {
                                    const updated = { ...editingSnsTemplate };
                                    updated.slides = [...updated.slides];
                                    updated.slides[slideIndex] = { ...slide, headerLine1: e.target.value };
                                    setEditingSnsTemplate(updated);
                                  }}
                                  placeholder="サブタイトル"
                                  className="w-full bg-transparent text-center font-bold outline-none placeholder:text-white/30"
                                  style={{ fontSize: "5.83cqi", color: slide.headerLine1Color ?? "#ffffff" }}
                                />
                                <input
                                  type="color"
                                  value={slide.headerLine1Color ?? "#ffffff"}
                                  onChange={(e) => {
                                    const updated = { ...editingSnsTemplate };
                                    updated.slides = [...updated.slides];
                                    updated.slides[slideIndex] = { ...slide, headerLine1Color: e.target.value };
                                    setEditingSnsTemplate(updated);
                                  }}
                                  className="absolute -bottom-5 left-1/2 hidden h-6 w-6 -translate-x-1/2 cursor-pointer rounded border-0 bg-transparent p-0 group-focus-within/h1:block"
                                />
                              </div>
                              <div className="group/h2 relative w-full focus-within:z-10">
                                <input
                                  type="text"
                                  value={slide.headerLine2 ?? ""}
                                  onChange={(e) => {
                                    const updated = { ...editingSnsTemplate };
                                    updated.slides = [...updated.slides];
                                    updated.slides[slideIndex] = { ...slide, headerLine2: e.target.value };
                                    setEditingSnsTemplate(updated);
                                  }}
                                  placeholder="メインタイトル"
                                  className="w-full bg-transparent text-center font-extrabold outline-none placeholder:text-white/30"
                                  style={{ fontSize: "7.5cqi", color: slide.headerLine2Color ?? "#ffffff" }}
                                />
                                <input
                                  type="color"
                                  value={slide.headerLine2Color ?? "#ffffff"}
                                  onChange={(e) => {
                                    const updated = { ...editingSnsTemplate };
                                    updated.slides = [...updated.slides];
                                    updated.slides[slideIndex] = { ...slide, headerLine2Color: e.target.value };
                                    setEditingSnsTemplate(updated);
                                  }}
                                  className="absolute -bottom-5 left-1/2 hidden h-6 w-6 -translate-x-1/2 cursor-pointer rounded border-0 bg-transparent p-0 group-focus-within/h2:block"
                                />
                              </div>
                            </div>
                            <div className="flex min-h-0 flex-1 flex-col gap-[2%]">
                              {[0, 1].map((si) => renderSlotInteractive(si, "min-h-0 flex-1"))}
                            </div>
                          </div>
                        )}
                        {/* 2枚目以降 */}
                        {!isFirstSlide && (
                          <div className={`h-full p-[1.5%] ${
                            slide.layout === "two-horizontal"
                              ? "flex flex-col gap-[2%]"
                              : "flex flex-col"
                          }`}>
                            {Array.from({ length: slotCount }, (_, si) =>
                              renderSlotInteractive(si, "min-h-0 flex-1")
                            )}
                          </div>
                        )}
                      </div>
                      {/* スライド操作ボタン */}
                      <div className="flex items-center justify-center gap-1">
                        {/* 2枚目以降: レイアウト切替 */}
                        {!isFirstSlide && ([
                          { type: "two-horizontal" as SnsLayoutType, icon: <RectangleHorizontal className="h-3 w-3" /> },
                          { type: "single" as SnsLayoutType, icon: <Square className="h-3 w-3" /> }
                        ]).map(({ type, icon }) => (
                          <button
                            key={type}
                            type="button"
                            title={type}
                            onClick={() => {
                              const newSlotCount = type === "single" ? 1 : 2;
                              const updated = { ...editingSnsTemplate };
                              updated.slides = [...updated.slides];
                              const currentSlots = slide.slots;
                              const newSlots = Array.from({ length: newSlotCount }, (_, i) => currentSlots[i] ?? null);
                              updated.slides[slideIndex] = { ...slide, layout: type, slots: newSlots };
                              setEditingSnsTemplate(updated);
                            }}
                            className={`flex h-6 w-6 items-center justify-center rounded-md transition ${
                              slide.layout === type
                                ? "bg-white text-black"
                                : "text-muted-foreground hover:bg-white/10 hover:text-white"
                            }`}
                          >
                            {icon}
                          </button>
                        ))}
                        {/* ダウンロード + 削除 */}
                        <button
                          type="button"
                          title="このスライドをダウンロード"
                          onClick={async () => {
                            if (!editingSnsTemplate) return;
                            const SIZE = 1080;
                            const PAD = Math.round(SIZE * 0.015);
                            const GAP = Math.round(SIZE * 0.02);
                            const loadImg = (src: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(); i.src = src; });
                            const renderSlotImg = async (sid: string | null) => {
                              if (!sid) return null;
                              const s = selectedShots.find((x) => x.id === sid) ?? snsShotPool[sid] ?? null;
                              if (!s) return null;
                              const b = await renderScreenshotWithTelop(s);
                              const u = URL.createObjectURL(b);
                              try { return await loadImg(u); } finally { URL.revokeObjectURL(u); }
                            };
                            const drawIn = (ctx: CanvasRenderingContext2D, img: HTMLImageElement | null, x: number, y: number, w: number, h: number) => {
                              if (!img) return;
                              const sc = Math.max(w / img.width, h / img.height);
                              const dw = img.width * sc, dh = img.height * sc;
                              ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
                              ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh); ctx.restore();
                            };
                            const canvas = document.createElement("canvas");
                            canvas.width = SIZE; canvas.height = SIZE;
                            const ctx = canvas.getContext("2d");
                            if (!ctx) return;
                            ctx.fillStyle = "#000000"; ctx.fillRect(0, 0, SIZE, SIZE);
                            const inner = SIZE - PAD * 2;
                            if (isFirstSlide) {
                              const headerH = Math.round(SIZE * 0.18);
                              ctx.textAlign = "center";
                              ctx.fillStyle = slide.headerLine1Color ?? "#ffffff";
                              ctx.font = "bold 63px 'Hiragino Sans', 'Noto Sans JP', sans-serif";
                              ctx.fillText(slide.headerLine1 ?? "", SIZE / 2, headerH * 0.42, inner);
                              ctx.fillStyle = slide.headerLine2Color ?? "#ffffff";
                              ctx.font = "800 81px 'Hiragino Sans', 'Noto Sans JP', sans-serif";
                              ctx.fillText(slide.headerLine2 ?? "", SIZE / 2, headerH * 0.82, inner);
                              const cTop = headerH, cH = SIZE - headerH - PAD, slotH = (cH - GAP) / 2;
                              drawIn(ctx, await renderSlotImg(slide.slots[0]), PAD, cTop, inner, slotH);
                              drawIn(ctx, await renderSlotImg(slide.slots[1]), PAD, cTop + slotH + GAP, inner, slotH);
                            } else if (slide.layout === "single") {
                              drawIn(ctx, await renderSlotImg(slide.slots[0]), PAD, PAD, inner, inner);
                            } else {
                              const slotH = (inner - GAP) / 2;
                              drawIn(ctx, await renderSlotImg(slide.slots[0]), PAD, PAD, inner, slotH);
                              drawIn(ctx, await renderSlotImg(slide.slots[1]), PAD, PAD + slotH + GAP, inner, slotH);
                            }
                            canvas.toBlob((b) => { if (b) downloadBlob(b, `slide-${slideIndex + 1}.jpg`); }, "image/jpeg", 0.94);
                          }}
                          className={`${!isFirstSlide ? "ml-2" : ""} flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition hover:bg-white/10 hover:text-white`}
                        >
                          <Download className="h-3 w-3" />
                        </button>
                        {!isFirstSlide && (
                          <button
                            type="button"
                            title="このスライドを削除"
                            onClick={() => setSnsSlideDeleteTarget(slideIndex)}
                            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition hover:bg-red-500/20 hover:text-red-400"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {/* スライド追加ボタン */}
                <div className="space-y-2">
                  <p className="text-center text-xs font-medium text-muted-foreground">&nbsp;</p>
                  <button
                    type="button"
                    className="flex aspect-square w-full items-center justify-center rounded-xl border border-dashed border-white/20 transition hover:border-white/40 hover:bg-white/5"
                    onClick={() => {
                      const updated = { ...editingSnsTemplate };
                      updated.slides = [
                        ...updated.slides,
                        {
                          id: `slide-${crypto.randomUUID()}`,
                          layout: "two-horizontal" as SnsLayoutType,
                          slots: [null, null]
                        }
                      ];
                      setEditingSnsTemplate(updated);
                    }}
                  >
                    <Plus className="h-6 w-6 text-muted-foreground" />
                  </button>
                </div>
              </div>
              </div>
              <div className="flex shrink-0 justify-end gap-2 border-t border-white/10 pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSnsTemplateDialogOpen(false)}
                >
                  閉じる
                </Button>
                <Button
                  size="sm"
                  onClick={async () => {
                    if (!editingSnsTemplate) return;

                    const SIZE = 1080;
                    const PAD = Math.round(SIZE * 0.015);
                    const GAP = Math.round(SIZE * 0.02);

                    const loadImage = (src: string) =>
                      new Promise<HTMLImageElement>((resolve, reject) => {
                        const img = new Image();
                        img.onload = () => resolve(img);
                        img.onerror = () => reject(new Error("画像読み込み失敗"));
                        img.src = src;
                      });

                    const renderSlotImage = async (shotId: string | null) => {
                      if (!shotId) return null;
                      const shot = selectedShots.find((s) => s.id === shotId) ?? snsShotPool[shotId] ?? null;
                      if (!shot) return null;
                      const blob = await renderScreenshotWithTelop(shot);
                      const url = URL.createObjectURL(blob);
                      try { return await loadImage(url); } finally { URL.revokeObjectURL(url); }
                    };

                    const drawSlotInRect = (ctx: CanvasRenderingContext2D, img: HTMLImageElement | null, x: number, y: number, w: number, h: number) => {
                      if (!img) return;
                      const scale = Math.max(w / img.width, h / img.height);
                      const dw = img.width * scale;
                      const dh = img.height * scale;
                      ctx.save();
                      ctx.beginPath();
                      ctx.rect(x, y, w, h);
                      ctx.clip();
                      ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
                      ctx.restore();
                    };

                    const zip = new JSZip();

                    for (let si = 0; si < editingSnsTemplate.slides.length; si++) {
                      const slide = editingSnsTemplate.slides[si];
                      const isFirst = si === 0;
                      const canvas = document.createElement("canvas");
                      canvas.width = SIZE;
                      canvas.height = SIZE;
                      const ctx = canvas.getContext("2d");
                      if (!ctx) continue;

                      ctx.fillStyle = "#000000";
                      ctx.fillRect(0, 0, SIZE, SIZE);

                      if (isFirst) {
                        const headerH = Math.round(SIZE * 0.18);
                        const line1 = slide.headerLine1 ?? "";
                        const line2 = slide.headerLine2 ?? "";

                        ctx.textAlign = "center";
                        ctx.fillStyle = slide.headerLine1Color ?? "#ffffff";

                        ctx.font = "bold 63px 'Hiragino Sans', 'Noto Sans JP', sans-serif";
                        ctx.fillText(line1, SIZE / 2, headerH * 0.42, SIZE - PAD * 2);

                        ctx.fillStyle = slide.headerLine2Color ?? "#ffffff";
                        ctx.font = "800 81px 'Hiragino Sans', 'Noto Sans JP', sans-serif";
                        ctx.fillText(line2, SIZE / 2, headerH * 0.82, SIZE - PAD * 2);

                        const contentTop = headerH;
                        const contentH = SIZE - headerH - PAD;
                        const slotH = (contentH - GAP) / 2;

                        const img0 = await renderSlotImage(slide.slots[0]);
                        const img1 = await renderSlotImage(slide.slots[1]);
                        drawSlotInRect(ctx, img0, PAD, contentTop, SIZE - PAD * 2, slotH);
                        drawSlotInRect(ctx, img1, PAD, contentTop + slotH + GAP, SIZE - PAD * 2, slotH);
                      } else {
                        const layout = slide.layout;
                        const inner = SIZE - PAD * 2;

                        if (layout === "single") {
                          const img = await renderSlotImage(slide.slots[0]);
                          drawSlotInRect(ctx, img, PAD, PAD, inner, inner);
                        } else {
                          const slotH = (inner - GAP) / 2;
                          const img0 = await renderSlotImage(slide.slots[0]);
                          const img1 = await renderSlotImage(slide.slots[1]);
                          drawSlotInRect(ctx, img0, PAD, PAD, inner, slotH);
                          drawSlotInRect(ctx, img1, PAD, PAD + slotH + GAP, inner, slotH);
                        }
                      }

                      const blob = await new Promise<Blob>((resolve, reject) => {
                        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("変換失敗"))), "image/jpeg", 0.94);
                      });
                      zip.file(`slide-${si + 1}.jpg`, blob);
                    }

                    const archive = await zip.generateAsync({ type: "blob" });
                    downloadBlob(archive, `${editingSnsTemplate.name || "sns-template"}.zip`);
                    setSnackbarMessage("テンプレートを書き出しました。");
                  }}
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  スライドを書き出し
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── ショット変更ダイアログ ── */}
      <Dialog open={shotReplacePickerOpen} onOpenChange={(open) => { if (!open) setShotReplacePickerOpen(false); }}>
        <DialogContent className="flex max-h-[calc(100vh-80px)] max-w-[700px] flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>ショットを変更</DialogTitle>
            <DialogDescription>動画からキャプチャするか、候補から選んで差し替えます。</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto space-y-6">
            {/* 動画プレビュー */}
            <div className="overflow-hidden rounded-xl border border-white/10 bg-white/5">
              <div className="overflow-hidden border-b border-white/10 bg-black/30">
                {videoUrl ? (
                  <video
                    ref={snsPickerVideoRef}
                    src={videoUrl}
                    className="aspect-video w-full object-contain"
                    playsInline
                  />
                ) : (
                  <div className="flex aspect-video items-center justify-center text-sm text-muted-foreground">
                    動画が読み込まれていません。
                  </div>
                )}
              </div>
              <div className="grid gap-3 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="icon" type="button" disabled={!videoUrl} onClick={() => { const v = snsPickerVideoRef.current; if (v) v.currentTime = Math.max(v.currentTime - 1, 0); }}>
                    <SkipBack className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" type="button" disabled={!videoUrl} onClick={() => { const v = snsPickerVideoRef.current; if (v) { if (v.paused) v.play(); else v.pause(); } }}>
                    <Play className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" type="button" disabled={!videoUrl} onClick={() => { const v = snsPickerVideoRef.current; if (v) v.currentTime = Math.min(v.currentTime + 1, v.duration || 0); }}>
                    <SkipForward className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="secondary"
                    type="button"
                    className="ml-auto"
                    disabled={!videoUrl}
                    onClick={() => {
                      const v = snsPickerVideoRef.current;
                      if (!v || !v.videoWidth || !v.videoHeight || !editingShot) return;
                      const canvas = document.createElement("canvas");
                      const width = 960;
                      const height = Math.round((width / v.videoWidth) * v.videoHeight);
                      canvas.width = width; canvas.height = height;
                      const ctx = canvas.getContext("2d");
                      if (!ctx) return;
                      ctx.drawImage(v, 0, 0, width, height);
                      updateShotInPools(editingShot.id, (current) => ({
                        ...current,
                        dataUrl: canvas.toDataURL("image/jpeg", 0.92),
                        width, height,
                        time: v.currentTime,
                        imageScale: 1, imageOffsetX: 0, imageOffsetY: 0
                      }));
                      setShotReplacePickerOpen(false);
                      setSnackbarMessage(`${formatTimestamp(v.currentTime)} のキャプチャに変更しました。`);
                    }}
                  >
                    <RotateCw className="mr-2 h-4 w-4" />
                    ショットを変更
                  </Button>
                </div>
                <div className="space-y-2">
                  <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
                    <span className="text-xs text-muted-foreground">{formatTimestamp(snsPickerVideoRef.current?.currentTime ?? 0)}</span>
                    <input
                      type="range"
                      min={0}
                      max={videoDuration || 0}
                      step={0.1}
                      defaultValue={editingShot?.time ?? 0}
                      onChange={(e) => { const v = snsPickerVideoRef.current; if (v) v.currentTime = Number(e.target.value); }}
                      className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/20 accent-white [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
                    />
                    <span className="text-xs text-muted-foreground">{formatTimestamp(videoDuration)}</span>
                  </div>
                </div>
              </div>
            </div>
            {/* 近いショット一覧 */}
            <div>
              <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                <Sparkles className="h-4 w-4 text-primary" />
                近いショット
              </h4>
              {isLoadingReplaceNearby ? (
                <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  近いショットを抽出しています...
                </div>
              ) : replaceNearbyShots.length ? (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                  {replaceNearbyShots.map((shot) => (
                    <div
                      key={shot.id}
                      className="group relative overflow-hidden border border-white/10 bg-white/5 text-left transition hover:bg-white/10"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (!editingShot) return;
                          updateShotInPools(editingShot.id, (current) => ({
                            ...current,
                            dataUrl: shot.dataUrl,
                            width: shot.width,
                            height: shot.height,
                            time: shot.time,
                            score: shot.score,
                            imageScale: 1, imageOffsetX: 0, imageOffsetY: 0
                          }));
                          setShotReplacePickerOpen(false);
                          setSnackbarMessage(`${formatTimestamp(shot.time)} のショットに変更しました。`);
                        }}
                        className="relative block w-full text-left"
                      >
                        <img src={shot.dataUrl} alt={formatTimestamp(shot.time)} className="aspect-video w-full object-cover" />
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/20">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/25 bg-black/45 text-white opacity-0 transition group-hover:opacity-100">
                            <RotateCw className="h-5 w-5" />
                          </div>
                        </div>
                      </button>
                      <div className="flex items-center gap-2 p-2">
                        <span className="text-[10px] text-muted-foreground">{formatTimestamp(shot.time)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  近いショットが見つかりません。
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── SNS スロット用ショット選択ダイアログ ── */}
      <Dialog open={Boolean(snsSlotPickerTarget)} onOpenChange={(open) => {
        if (!open) setSnsSlotPickerTarget(null);
      }}>
        <DialogContent className="max-h-[calc(100vh-80px)] max-w-6xl overflow-hidden">
          <DialogHeader>
            <DialogTitle>ショットを選択</DialogTitle>
            <DialogDescription>動画からキャプチャするか、テロップショットから選んでください。</DialogDescription>
          </DialogHeader>
          <div className="grid min-h-0 flex-1 grid-cols-2 gap-6">
            {/* 左: 動画プレビュー */}
            <div className="flex flex-col gap-3">
              <div className="overflow-hidden rounded-xl border border-white/10 bg-black/30">
                {videoUrl ? (
                  <>
                    <video
                      ref={snsPickerVideoRef}
                      src={videoUrl}
                      className="aspect-video w-full object-contain"
                      playsInline
                      onTimeUpdate={(e) => {
                        const v = e.currentTarget;
                        const bar = document.getElementById("sns-picker-seekbar") as HTMLInputElement | null;
                        if (bar && v.duration) bar.value = String(v.currentTime);
                      }}
                      onLoadedMetadata={(e) => {
                        const v = e.currentTarget;
                        const bar = document.getElementById("sns-picker-seekbar") as HTMLInputElement | null;
                        if (bar) { bar.max = String(v.duration); bar.value = String(v.currentTime); }
                      }}
                    />
                    <div className="space-y-2 p-3">
                      <input
                        id="sns-picker-seekbar"
                        type="range"
                        min={0}
                        max={videoDuration || 0}
                        step={0.1}
                        defaultValue={0}
                        onChange={(e) => {
                          const v = snsPickerVideoRef.current;
                          if (v) v.currentTime = Number(e.target.value);
                        }}
                        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/20 accent-white [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
                      />
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="icon" type="button" onClick={() => { const v = snsPickerVideoRef.current; if (v) v.currentTime = Math.max(v.currentTime - 1, 0); }}>
                          <SkipBack className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="icon" type="button" onClick={() => { const v = snsPickerVideoRef.current; if (v) { if (v.paused) v.play(); else v.pause(); } }}>
                          <Play className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="icon" type="button" onClick={() => { const v = snsPickerVideoRef.current; if (v) v.currentTime = Math.min(v.currentTime + 1, v.duration || 0); }}>
                          <SkipForward className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          type="button"
                          className="ml-auto"
                          onClick={() => {
                            const v = snsPickerVideoRef.current;
                            if (!v || !v.videoWidth || !v.videoHeight || !editingSnsTemplate || !snsSlotPickerTarget) return;
                            const canvas = document.createElement("canvas");
                            const width = 960;
                            const height = Math.round((width / v.videoWidth) * v.videoHeight);
                            canvas.width = width;
                            canvas.height = height;
                            const ctx = canvas.getContext("2d");
                            if (!ctx) return;
                            ctx.drawImage(v, 0, 0, width, height);
                            const newShot: ScreenshotCandidate = {
                              id: `manual-${crypto.randomUUID()}`,
                              time: v.currentTime,
                              score: 0,
                              dataUrl: canvas.toDataURL("image/jpeg", 0.92),
                              width,
                              height,
                              telops: [createTelopItem()],
                              selectedTelopId: null
                            };
                            newShot.selectedTelopId = newShot.telops?.[0]?.id ?? null;
                            setSnsShotPool((prev) => ({ ...prev, [newShot.id]: newShot }));
                            void saveSnsShotPoolEntry(newShot);
                            const { slideIndex, slotIndex } = snsSlotPickerTarget;
                            const updated = { ...editingSnsTemplate };
                            updated.slides = [...updated.slides];
                            const slide = { ...updated.slides[slideIndex] };
                            slide.slots = [...slide.slots];
                            slide.slots[slotIndex] = newShot.id;
                            updated.slides[slideIndex] = slide;
                            setEditingSnsTemplate(updated);
                            setSnsSlotPickerTarget(null);
                            setSnackbarMessage(`${formatTimestamp(v.currentTime)} をキャプチャしました。`);
                          }}
                        >
                          <ImagePlus className="mr-1.5 h-3.5 w-3.5" />
                          キャプチャして配置
                        </Button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex aspect-video items-center justify-center text-sm text-muted-foreground">
                    動画が読み込まれていません。
                  </div>
                )}
              </div>
            </div>
            {/* 右: テロップショット一覧 */}
            <div className="flex min-h-0 flex-col">
              <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                <Type className="h-4 w-4 text-primary" />
                テロップショット
              </h4>
              <ScrollArea className="min-h-0 flex-1">
                {selectedShots.length ? (
                  <div className="grid grid-cols-2 gap-3 pr-3">
                    {selectedShots.map((shot) => {
                      const previewUrl = selectedShotPreviewMap[shot.id] || shot.dataUrl;
                      return (
                        <button
                          key={shot.id}
                          type="button"
                          className="group relative overflow-hidden rounded-lg border border-white/10 bg-white/5 transition hover:bg-white/10"
                          onClick={() => {
                            if (!editingSnsTemplate || !snsSlotPickerTarget) return;
                            const { slideIndex, slotIndex } = snsSlotPickerTarget;
                            const updated = { ...editingSnsTemplate };
                            updated.slides = [...updated.slides];
                            const slide = { ...updated.slides[slideIndex] };
                            slide.slots = [...slide.slots];
                            slide.slots[slotIndex] = shot.id;
                            updated.slides[slideIndex] = slide;
                            setEditingSnsTemplate(updated);
                            setSnsSlotPickerTarget(null);
                          }}
                        >
                          <img
                            src={previewUrl}
                            alt={`ショット ${formatTimestamp(shot.time)}`}
                            className="aspect-video w-full object-cover"
                          />
                          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/20">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/25 bg-black/45 text-white opacity-0 transition group-hover:opacity-100">
                              <Plus className="h-5 w-5" />
                            </div>
                          </div>
                          <div className="p-2">
                            <span className="text-[10px] text-muted-foreground">{formatTimestamp(shot.time)}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    テロップショットがまだありません。先にショットを追加してください。
                  </div>
                )}
              </ScrollArea>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── コミュニティテンプレート削除確認ダイアログ ── */}
      <Dialog open={Boolean(snsTemplateDeleteTarget)} onOpenChange={(open) => { if (!open) setSnsTemplateDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>テンプレートを削除</DialogTitle>
            <DialogDescription>
              「{snsTemplateDeleteTarget?.name || "無題のテンプレート"}」を削除しますか？この操作は取り消せません。
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setSnsTemplateDeleteTarget(null)}>キャンセル</Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (!snsTemplateDeleteTarget) return;
                setSnsTemplates((prev) => prev.filter((t) => t.id !== snsTemplateDeleteTarget.id));
                void deleteSnsTemplate(snsTemplateDeleteTarget.id);
                setSnsTemplateDeleteTarget(null);
                setSnackbarMessage("テンプレートを削除しました。");
              }}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              削除
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── SNS スライド削除確認ダイアログ ── */}
      <Dialog open={snsSlideDeleteTarget !== null} onOpenChange={(open) => {
        if (!open) setSnsSlideDeleteTarget(null);
      }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>スライドを削除</DialogTitle>
            <DialogDescription>
              {snsSlideDeleteTarget !== null ? `${snsSlideDeleteTarget + 1} 枚目のスライドを削除しますか？` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setSnsSlideDeleteTarget(null)}>
              キャンセル
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (editingSnsTemplate && snsSlideDeleteTarget !== null) {
                  const updated = { ...editingSnsTemplate };
                  updated.slides = updated.slides.filter((_, i) => i !== snsSlideDeleteTarget);
                  setEditingSnsTemplate(updated);
                }
                setSnsSlideDeleteTarget(null);
              }}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              削除
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(nearbyTargetShot)} onOpenChange={(open) => {
        if (!open) {
          setNearbyTargetShot(null);
          setNearbyShots([]);
        }
      }}>
        <DialogContent className="max-h-[calc(100vh-80px)] max-w-5xl overflow-hidden">
          <DialogHeader>
            <DialogTitle>近いショットを選ぶ</DialogTitle>
            <DialogDescription>
              {nearbyTargetShot
                ? `${formatTimestamp(nearbyTargetShot.time)} の前後から近いフレームを並べました。選ぶとテロップショットに追加されます。`
                : "近いフレームを表示します。"}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[calc(100vh-220px)] pr-2">
            {isLoadingNearbyShots ? (
              <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                近い候補を抽出しています...
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {nearbyShots.map((shot, index) => (
                  <div
                    key={shot.id}
                    className="group overflow-hidden border border-white/10 bg-white/5 text-left transition hover:bg-white/10"
                  >
                    <button
                      type="button"
                      onClick={() => addSelectedShot(shot)}
                      aria-label={`近い候補 ${index + 1} をテロップショットに追加`}
                      className="relative block w-full"
                    >
                      <img
                        src={shot.dataUrl}
                        alt={`近い候補 ${index + 1}`}
                        className="aspect-video w-full object-cover"
                      />
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/20">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/25 bg-black/45 text-white opacity-0 transition group-hover:opacity-100">
                          <Plus className="h-5 w-5" />
                        </div>
                      </div>
                    </button>
                    <div className="p-2">
                      <Badge className="w-fit px-2 py-0.5 text-[10px]">
                        {formatTimestamp(shot.time)}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(scenePreviewSegment)}
        onOpenChange={(open) => {
          if (!open) {
            setScenePreviewSegment(null);
          }
        }}
      >
        <DialogContent className="max-w-3xl overflow-hidden">
          <DialogHeader>
            <DialogTitle>盛り上がり区間を再生</DialogTitle>
            <DialogDescription>
              {scenePreviewSegment
                ? `${formatTimestamp(scenePreviewSegment.rangeStart)} 〜 ${formatTimestamp(scenePreviewSegment.rangeEnd)} の区間を再生します。`
                : "選択した盛り上がり区間を再生します。"}
            </DialogDescription>
          </DialogHeader>
          {scenePreviewSegment ? (
            <div className="space-y-3">
              <div className="overflow-hidden border border-white/10 bg-white/[0.04]">
                <video
                  ref={sceneSegmentVideoRef}
                  src={uploadedVideos.find((video) => video.id === scenePreviewSegment.videoId)?.url ?? ""}
                  className="aspect-video w-full object-contain bg-black"
                  controls
                  playsInline
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-white/55">
                <span>{scenePreviewSegment.videoName}</span>
                <span>
                  ピーク {formatTimestamp(scenePreviewSegment.peakTime)} / 区間 {formatTimestamp(scenePreviewSegment.rangeStart)} - {formatTimestamp(scenePreviewSegment.rangeEnd)}
                </span>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(storyDetailTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setStoryDetailTarget(null);
            setStoryDetailResult(null);
          }
        }}
      >
        <DialogContent className="max-h-[calc(100vh-80px)] max-w-6xl overflow-hidden">
          <DialogHeader>
            <DialogTitle>ストーリー構成を提案</DialogTitle>
            <DialogDescription>
              {storyDetailTarget
                ? `${storyDetailTarget.title} を、紙芝居のように 5 コマで整理しました。`
                : "選択したストーリーを 5 コマ構成で表示します。"}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[calc(100vh-220px)] overflow-y-auto pr-2">
            {isGeneratingStoryDetail ? (
              <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                AI で構成を提案しています...
              </div>
            ) : storyDetailResult ? (
              <div className="space-y-5">
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-white">{storyDetailResult.title}</h3>
                  <p className="text-sm leading-6 text-white/65">{storyDetailResult.summary}</p>
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                  {storyDetailResult.panels.map((panel, index) => (
                    <div
                      key={`${panel.time}-${index}`}
                      className="group overflow-hidden rounded-xl border border-white/10 bg-white/5"
                    >
                      <button
                        type="button"
                        aria-label={`構成ショット ${index + 1} をテロップショットに追加`}
                        onClick={() => addSelectedShot(panel.shot)}
                        className="relative block w-full text-left"
                      >
                        <img
                          src={panel.shot.dataUrl}
                          alt={`構成ショット ${index + 1}`}
                          className="aspect-video w-full object-cover"
                        />
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/20">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/25 bg-black/45 text-white opacity-0 transition group-hover:opacity-100">
                            <Plus className="h-5 w-5" />
                          </div>
                        </div>
                      </button>
                      <div className="space-y-2 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-white">{panel.title}</p>
                          <div className="flex items-center gap-1">
                            <Badge className="px-2 py-0.5 text-[10px]">
                              {formatTimestamp(panel.time)}
                            </Badge>
                            <button
                              type="button"
                              title="近いショットを選ぶ"
                              onClick={() => void openNearbyShotsDialog(panel.shot)}
                              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-white/10 hover:text-white"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        <p className="text-xs leading-5 text-white/60">{panel.summary}</p>
                        <p className="text-[11px] leading-5 text-white/45">{panel.shotDirection}</p>
                        <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                          <p className="text-[11px] text-white/45">提案テロップ</p>
                          <p className="mt-1 text-sm font-medium text-white">{panel.recommendedTelop}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                ストーリー構成を生成すると、ここに 5 コマの提案が表示されます。
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(editingShot)}
        onOpenChange={(open) => {
          if (!open) {
            const closingShot = editingShot;
            setEditingShotId(null);
            setSnsTelopEditCropRatio(null);
            setShotReplacePickerOpen(false);
            if (closingShot) {
              void renderScreenshotPreviewDataUrl(closingShot).then((url) => {
                setSelectedShotPreviewMap((prev) => ({ ...prev, [closingShot.id]: url }));
              });
            }
          }
        }}
      >
        <DialogContent
          className="max-h-[calc(100vh-80px)] max-w-6xl overflow-hidden"
          overlayClassName="backdrop-blur-none"
          onPointerDownOutside={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>テロップを編集</DialogTitle>
            <DialogDescription>
              ショットごとに独立したテロップ設定を保存できます。
            </DialogDescription>
          </DialogHeader>
          {editingShot ? (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_340px_180px]">
              <div className="space-y-4">
                <div className="relative">
                  <PreviewCanvas
                    shot={editingShot}
                    selectedTelopId={selectedEditingTelop?.id ?? null}
                    onSelectTelop={selectEditingTelop}
                    onMoveTelop={(_, { x, y }) => updateEditingShotTelop({ x, y })}
                    cropMode={!isTransformingOverlay}
                    overlayMode={isTransformingOverlay}
                    onMoveImage={updateEditingShotImage}
                    onMoveOverlay={updateEditingShotOverlay}
                  />
                  {snsTelopEditCropRatio && editingShot.width && editingShot.height && (() => {
                    const shotRatio = editingShot.width / editingShot.height;
                    const cropRatio = snsTelopEditCropRatio;
                    if (cropRatio >= shotRatio) {
                      // グリッドの方が横長 or 同じ → 上下を暗くする
                      const visibleH = shotRatio / cropRatio * 100;
                      const darkH = (100 - visibleH) / 2;
                      return (
                        <>
                          <div className="pointer-events-none absolute left-0 right-0 top-0" style={{ height: `${darkH}%`, backgroundColor: "rgba(0,0,0,0.6)" }} />
                          <div className="pointer-events-none absolute bottom-0 left-0 right-0" style={{ height: `${darkH}%`, backgroundColor: "rgba(0,0,0,0.6)" }} />
                        </>
                      );
                    } else {
                      // グリッドの方が縦長 → 左右を暗くする
                      const visibleW = cropRatio / shotRatio * 100;
                      const darkW = (100 - visibleW) / 2;
                      return (
                        <>
                          <div className="pointer-events-none absolute bottom-0 left-0 top-0" style={{ width: `${darkW}%`, backgroundColor: "rgba(0,0,0,0.6)" }} />
                          <div className="pointer-events-none absolute bottom-0 right-0 top-0" style={{ width: `${darkW}%`, backgroundColor: "rgba(0,0,0,0.6)" }} />
                        </>
                      );
                    }
                  })()}
                </div>
                <div className="space-y-3">
                  <input
                    ref={overlayImageInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      void handleOverlayImageSelected(file);
                      event.currentTarget.value = "";
                    }}
                  />
                  <div className="flex items-center gap-3">
                    <Label className="shrink-0 text-xs text-white/60">拡大率</Label>
                    <Slider
                      value={[editingShot.imageScale ?? 1]}
                      min={1}
                      max={2.5}
                      step={0.01}
                      className="flex-1"
                      onValueChange={([value]) =>
                        updateEditingShotImage({
                          imageScale: value,
                          imageOffsetX: editingShot.imageOffsetX ?? 0,
                          imageOffsetY: editingShot.imageOffsetY ?? 0
                        })
                      }
                    />
                    <span className="w-10 shrink-0 text-right text-xs text-white/60">{Math.round((editingShot.imageScale ?? 1) * 100)}%</span>
                    <button
                      type="button"
                      title="位置をリセット"
                      disabled={(editingShot.imageScale ?? 1) === 1 && (editingShot.imageOffsetX ?? 0) === 0 && (editingShot.imageOffsetY ?? 0) === 0}
                      onClick={() => updateEditingShotImage({ imageScale: 1, imageOffsetX: 0, imageOffsetY: 0 })}
                      className="shrink-0 rounded-md px-2 py-1 text-[10px] text-white/40 transition hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-white/40"
                    >
                      リセット
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" onClick={() => {
                      setShotReplacePickerOpen(true);
                      setReplaceNearbyShots([]);
                      if (editingShot) {
                        requestAnimationFrame(() => {
                          const v = snsPickerVideoRef.current;
                          if (v) {
                            const seekTo = () => { v.currentTime = editingShot.time; };
                            if (v.readyState >= 1) seekTo();
                            else v.addEventListener("loadedmetadata", seekTo, { once: true });
                          }
                        });
                      }
                      if (editingShot) {
                        const activeVideo = uploadedVideos.find((v) => v.id === currentVideoId);
                        if (activeVideo?.file) {
                          setIsLoadingReplaceNearby(true);
                          extractNearbyShots(activeVideo.file as File, editingShot.time, 30, 36)
                            .then((shots) => setReplaceNearbyShots(shots))
                            .catch(() => {})
                            .finally(() => setIsLoadingReplaceNearby(false));
                        }
                      }
                    }} className="gap-2">
                      <RotateCw className="h-4 w-4" />
                      ショットを変更
                    </Button>
                    <Button type="button" variant="outline" onClick={() => overlayImageInputRef.current?.click()} className="gap-2">
                      <ImagePlus className="h-4 w-4" />
                      画像を追加
                    </Button>
                    {editingShot.overlayImageDataUrl ? (
                      <Button type="button" variant={isTransformingOverlay ? "secondary" : "outline"} onClick={() => setIsTransformingOverlay((c) => !c)} className="gap-2">
                        <Move className="h-4 w-4" />
                        {isTransformingOverlay ? "画像の編集を終了" : "画像を編集"}
                      </Button>
                    ) : null}
                  </div>
                  {isTransformingOverlay && editingShot.overlayImageDataUrl ? (
                    <div className="grid gap-3 grid-cols-2">
                      <div className="space-y-2">
                        <Label className="text-xs">画像の拡大率 {Math.round((editingShot.overlayScale ?? 1) * 100)}%</Label>
                        <Slider
                          value={[editingShot.overlayScale ?? 1]}
                          min={0.2}
                          max={3}
                          step={0.01}
                          onValueChange={([value]) =>
                            updateEditingShotOverlay({
                              overlayScale: value,
                              overlayX: editingShot.overlayX ?? 50,
                              overlayY: editingShot.overlayY ?? 50,
                              overlayRotation: editingShot.overlayRotation ?? 0
                            })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">回転 {Math.round(editingShot.overlayRotation ?? 0)}°</Label>
                        <Slider
                          value={[editingShot.overlayRotation ?? 0]}
                          min={-180}
                          max={180}
                          step={1}
                          onValueChange={([value]) =>
                            updateEditingShotOverlay({
                              overlayScale: editingShot.overlayScale ?? 1,
                              overlayX: editingShot.overlayX ?? 50,
                              overlayY: editingShot.overlayY ?? 50,
                              overlayRotation: value
                            })
                          }
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="min-w-0">
                <div className="max-h-[calc(100vh-220px)] min-w-0 space-y-4 overflow-x-hidden overflow-y-auto pr-1">
                    <div className="space-y-3">
                      <div className="space-y-2">
                        {editingTelops.map((telop, index) => {
                          const isSelected = telop.id === selectedEditingTelop?.id;
                          return (
                            <div
                              key={telop.id}
                              className={`flex items-center justify-between rounded-lg border px-3 py-2 transition-colors ${
                                isSelected
                                  ? "border-white/20 bg-white/10"
                                  : "border-white/8 bg-white/[0.03]"
                              }`}
                            >
                              <button
                                type="button"
                                className="flex min-w-0 flex-1 items-center gap-3 text-left"
                                onClick={() => selectEditingTelop(telop.id)}
                              >
                                <div className="shrink-0 text-muted-foreground">
                                  {isSelected ? (
                                    <CheckCircle2 className="h-4 w-4 text-foreground" />
                                  ) : (
                                    <Circle className="h-4 w-4" />
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold">テロップ {index + 1}</p>
                                  <p className="truncate text-sm text-white/55">{telop.text}</p>
                                </div>
                              </button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 shrink-0"
                                disabled={editingTelops.length <= 1}
                                onClick={() => setTelopPendingDeleteId(telop.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                      <button
                        type="button"
                        onClick={addEditingTelop}
                        className="flex items-center gap-1.5 px-1 text-xs text-white/40 transition hover:text-white/70"
                      >
                        <Plus className="h-3 w-3" />
                        テロップを追加
                      </button>
                    </div>
                    <div className="space-y-4">
                      <Separator />
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold">
                          {selectedEditingTelop
                            ? `テロップ${editingTelops.findIndex((telop) => telop.id === selectedEditingTelop.id) + 1}`
                            : "編集中"}
                        </p>
                        <button
                          type="button"
                          disabled={!isSelectedEditingTelopDirty}
                          onClick={() => setTelopResetConfirmOpen(true)}
                          className="shrink-0 rounded-md px-2 py-1 text-[10px] text-white/40 transition hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-white/40"
                        >
                          リセット
                        </button>
                      </div>
                      <Textarea
                        id="telop-text"
                        value={selectedEditingTelop?.text ?? ""}
                        onChange={(event) => updateEditingShotTelop({ text: event.target.value })}
                        className="min-h-[78px] w-full max-w-full border-white/12 bg-[#2b2d33] text-white placeholder:text-white/30 focus-visible:ring-inset"
                      />
                      <div className="space-y-2">
                        <Select
                          value={selectedEditingTelop?.fontFamily ?? defaultTelop.fontFamily}
                          onValueChange={(value) => updateEditingShotTelop({ fontFamily: value })}
                        >
                          <SelectTrigger className="h-10 w-full rounded-md bg-[#2b2d33] text-white focus:ring-inset">
                            <SelectValue placeholder="フォントを選択" />
                          </SelectTrigger>
                          <SelectContent>
                            {FONT_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <label
                          htmlFor="text-color"
                          className="group relative flex h-10 cursor-pointer items-center gap-2 rounded-md border border-white/12 bg-[#2b2d33] px-2.5 transition-colors hover:border-white/20 hover:bg-[#31343b]"
                        >
                          <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-white/15 shadow-sm" style={{ backgroundColor: selectedEditingTelop?.color ?? defaultTelop.color }} />
                          <span className="text-xs font-medium text-white/80">文字</span>
                          <input id="text-color" type="color" value={selectedEditingTelop?.color ?? defaultTelop.color} onChange={(e) => updateEditingShotTelop({ color: e.target.value })} className="absolute inset-0 cursor-pointer opacity-0" />
                        </label>
                        <div className="relative flex h-10 items-center gap-2 rounded-md border border-white/12 bg-[#2b2d33] px-2.5 transition-colors hover:border-white/20 hover:bg-[#31343b]">
                          {(selectedEditingTelop?.strokeWidth ?? defaultTelop.strokeWidth) > 0 ? (
                            <>
                              <label className="relative flex cursor-pointer items-center gap-2">
                                <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-white/15 shadow-sm" style={{ backgroundColor: selectedEditingTelop?.strokeColor ?? defaultTelop.strokeColor }} />
                                <span className="text-xs font-medium text-white/80">縁取</span>
                                <input type="color" value={selectedEditingTelop?.strokeColor ?? defaultTelop.strokeColor} onChange={(e) => updateEditingShotTelop({ strokeColor: e.target.value })} className="absolute inset-0 cursor-pointer opacity-0" />
                              </label>
                              <button type="button" onClick={() => updateEditingShotTelop({ strokeWidth: 0 })} className="ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white/40 transition hover:bg-white/10 hover:text-white">
                                <span className="text-xs leading-none">✕</span>
                              </button>
                            </>
                          ) : (
                            <label className="relative flex cursor-pointer items-center gap-2">
                              <span className="relative flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border border-white/15 bg-transparent">
                                <span className="absolute h-[1px] w-full rotate-45 bg-red-500" />
                              </span>
                              <span className="text-xs font-medium text-white/40">縁取</span>
                              <input type="color" value={selectedEditingTelop?.strokeColor ?? defaultTelop.strokeColor} onChange={(e) => updateEditingShotTelop({ strokeColor: e.target.value, strokeWidth: defaultTelop.strokeWidth })} className="absolute inset-0 cursor-pointer opacity-0" />
                            </label>
                          )}
                        </div>
                        <div className="relative flex h-10 items-center gap-2 rounded-md border border-white/12 bg-[#2b2d33] px-2.5 transition-colors hover:border-white/20 hover:bg-[#31343b]">
                          {selectedEditingTelop?.backgroundColor ? (
                            <>
                              <label className="relative flex cursor-pointer items-center gap-2">
                                <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-white/15 shadow-sm" style={{ backgroundColor: selectedEditingTelop.backgroundColor }} />
                                <span className="text-xs font-medium text-white/80">背景</span>
                                <input type="color" value={selectedEditingTelop.backgroundColor} onChange={(e) => updateEditingShotTelop({ backgroundColor: e.target.value })} className="absolute inset-0 cursor-pointer opacity-0" />
                              </label>
                              <button type="button" onClick={() => updateEditingShotTelop({ backgroundColor: null })} className="ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white/40 transition hover:bg-white/10 hover:text-white">
                                <span className="text-xs leading-none">✕</span>
                              </button>
                            </>
                          ) : (
                            <label className="relative flex cursor-pointer items-center gap-2">
                              <span className="relative flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border border-white/15 bg-transparent">
                                <span className="absolute h-[1px] w-full rotate-45 bg-red-500" />
                              </span>
                              <span className="text-xs font-medium text-white/40">背景</span>
                              <input type="color" value="#000000" onChange={(e) => updateEditingShotTelop({ backgroundColor: e.target.value })} className="absolute inset-0 cursor-pointer opacity-0" />
                            </label>
                          )}
                        </div>
                      </div>
                      <div className="space-y-2">
                        {([
                          { label: "サイズ", unit: "px", value: selectedEditingTelop?.fontSize ?? defaultTelop.fontSize, min: 24, max: 88, step: 1, onChange: (v: number) => updateEditingShotTelop({ fontSize: v }) },
                          { label: "太さ", unit: "px", value: selectedEditingTelop?.fontWeight ?? defaultTelop.fontWeight, min: 400, max: 900, step: 100, onChange: (v: number) => updateEditingShotTelop({ fontWeight: v }) },
                          { label: "縁取", unit: "px", value: selectedEditingTelop?.strokeWidth ?? defaultTelop.strokeWidth, min: 0, max: 14, step: 1, onChange: (v: number) => updateEditingShotTelop({ strokeWidth: v }) },
                          { label: "行間", unit: "px", value: Number(selectedEditingTelop?.lineHeight ?? defaultTelop.lineHeight), min: 0.8, max: 1.8, step: 0.05, onChange: (v: number) => updateEditingShotTelop({ lineHeight: v }), decimal: 2 },
                          { label: "最大幅", unit: "%", value: Math.round(selectedEditingTelop?.maxWidth ?? defaultTelop.maxWidth), min: 30, max: 95, step: 1, onChange: (v: number) => updateEditingShotTelop({ maxWidth: v }) }
                        ] as Array<{ label: string; unit: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; decimal?: number }>).map(({ label, unit, value, min, max, step, onChange, decimal }) => (
                          <div key={label} className="flex h-9 items-center gap-2 px-1">
                            <span className="w-10 shrink-0 text-xs font-medium text-white/80">{label}</span>
                            <Slider
                              value={[value]}
                              min={min}
                              max={max}
                              step={step}
                              onValueChange={([v]) => onChange(v)}
                              className="flex-1"
                            />
                            <div className="flex shrink-0 items-center gap-0.5">
                              <button type="button" onClick={() => { const v = Math.max(value - step, min); onChange(Math.round(v * 1000) / 1000); }} className="flex h-6 w-5 items-center justify-center rounded text-white/30 transition hover:bg-white/10 hover:text-white">
                                <svg width="8" height="8" viewBox="0 0 8 8"><path d="M6 3L4 5L2 3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" /></svg>
                              </button>
                              <input
                                type="number"
                                value={decimal ? value.toFixed(decimal) : value}
                                min={min}
                                max={max}
                                step={step}
                                onChange={(e) => {
                                  const v = Number(e.target.value);
                                  if (!isNaN(v) && v >= min && v <= max) onChange(v);
                                }}
                                className="w-12 bg-transparent text-center text-xs text-white outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                              />
                              <button type="button" onClick={() => { const v = Math.min(value + step, max); onChange(Math.round(v * 1000) / 1000); }} className="flex h-6 w-5 items-center justify-center rounded text-white/30 transition hover:bg-white/10 hover:text-white">
                                <svg width="8" height="8" viewBox="0 0 8 8"><path d="M2 5L4 3L6 5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" /></svg>
                              </button>
                            </div>
                            {unit && <span className="text-[10px] text-white/35">{unit}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              {/* 右カラム: アクション */}
              <div className="min-w-0">
                <div className="space-y-2">
                  <p className="px-1 text-[11px] font-medium text-white/40">アクション</p>
                  <div className="space-y-1">
                    <Button type="button" variant="ghost" className="h-9 w-full justify-start gap-2 px-2 text-xs text-white/70 hover:text-white" onClick={copyEditingTelop} disabled={!selectedEditingTelop}>
                      <Copy className="h-3.5 w-3.5" />
                      テロップをコピー
                    </Button>
                    <Button type="button" variant="ghost" className="h-9 w-full justify-start gap-2 px-2 text-xs text-white/70 hover:text-white" onClick={pasteEditingTelop} disabled={!selectedEditingTelop || !copiedTelop}>
                      <Clipboard className="h-3.5 w-3.5" />
                      テロップを貼り付け
                    </Button>
                    <Button type="button" variant="ghost" className="h-9 w-full justify-start gap-2 px-2 text-xs text-white/70 hover:text-white" onClick={() => { setTelopStyleName(`スタイル ${new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}`); setSaveTelopStyleDialogOpen(true); }}>
                      <Save className="h-3.5 w-3.5" />
                      スタイルを保存
                    </Button>
                    <Button type="button" variant="ghost" className="h-9 w-full justify-start gap-2 px-2 text-xs text-white/70 hover:text-white" onClick={() => setApplyTelopStyleDialogOpen(true)} disabled={!savedTelopStyles.length}>
                      <Palette className="h-3.5 w-3.5" />
                      スタイルを適用
                    </Button>
                    <Separator className="my-2" />
                    <Button type="button" variant="ghost" className="h-9 w-full justify-start gap-2 px-2 text-xs text-white/70 hover:text-white" onClick={() => void downloadSingleShot(editingShot)}>
                      <Download className="h-3.5 w-3.5" />
                      ダウンロード
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(projectPendingDelete)}
        onOpenChange={(open) => {
          if (!open) setProjectPendingDelete(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>プロジェクトを削除</DialogTitle>
            <DialogDescription>
              {projectPendingDelete
                ? `「${projectPendingDelete.title}」を削除します。この操作は元に戻せません。`
                : "この操作は元に戻せません。"}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setProjectPendingDelete(null)}
            >
              キャンセル
            </Button>
            <Button type="button" variant="secondary" onClick={confirmDeleteProject}>
              削除する
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkDeleteShotsOpen} onOpenChange={setBulkDeleteShotsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>テロップショットを削除</DialogTitle>
            <DialogDescription>
              {selectedShotIds.length
                ? `選択した ${selectedShotIds.length} 件のショットを削除します。`
                : "この操作は元に戻せません。"}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setBulkDeleteShotsOpen(false)}
            >
              キャンセル
            </Button>
            <Button type="button" variant="secondary" onClick={confirmDeleteSelectedShots}>
              削除する
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={telopResetConfirmOpen} onOpenChange={setTelopResetConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>テロップをリセット</DialogTitle>
            <DialogDescription>
              このテロップの設定を初期状態に戻します。
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setTelopResetConfirmOpen(false)}
            >
              キャンセル
            </Button>
            <Button type="button" variant="secondary" onClick={resetEditingTelop}>
              リセットする
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={saveTelopStyleDialogOpen} onOpenChange={setSaveTelopStyleDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>テロップスタイルを保存</DialogTitle>
            <DialogDescription>
              フォント、太さ、行間、文字エリアの最大幅、文字サイズ、縁取り、文字色、縁取り色を保存します。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="telop-style-name">スタイル名</Label>
              <Input
                id="telop-style-name"
                value={telopStyleName}
                onChange={(event) => setTelopStyleName(event.target.value)}
                placeholder="例: 太め白文字"
                className="bg-[#2b2d33] text-white placeholder:text-white/30"
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setSaveTelopStyleDialogOpen(false)}
              >
                キャンセル
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={saveCurrentTelopStyle}
                disabled={!telopStyleName.trim()}
              >
                保存
              </Button>
            </div>
            <div className="space-y-2">
              <Label>保存済みスタイル</Label>
              <div className="space-y-2">
                {savedTelopStyles.length ? (
                  savedTelopStyles.map((stylePreset) => (
                    <div
                      key={stylePreset.id}
                      className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.04] px-3 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{stylePreset.name}</p>
                        {(() => {
                          const meta = getSavedStyleMeta(stylePreset);
                          return (
                            <div className="mt-1 space-y-0.5 text-[11px] text-white/40">
                              <p>{`${getFontOptionLabel(meta.fontFamily)} / 太さ ${meta.fontWeight} / 行間 ${meta.lineHeight.toFixed(2)}`}</p>
                              <p>{`文字サイズ ${stylePreset.style.fontSize}px / 縁取り ${stylePreset.style.strokeWidth}px / 文字エリアの最大幅 ${Math.round(stylePreset.style.maxWidth)}%`}</p>
                            </div>
                          );
                        })()}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => void removeSavedTelopStyle(stylePreset.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed border-white/10 p-4 text-sm text-muted-foreground">
                    まだ保存したスタイルがありません。
                  </div>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={applyTelopStyleDialogOpen} onOpenChange={setApplyTelopStyleDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>テロップスタイル</DialogTitle>
            <DialogDescription>
              保存済みのスタイルを今編集中のテロップに適用します。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {savedTelopStyles.length ? (
              savedTelopStyles.map((stylePreset) => (
                <button
                  key={stylePreset.id}
                  type="button"
                  onClick={() => applySavedTelopStyle(stylePreset)}
                  className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-white/[0.04] px-3 py-3 text-left transition hover:bg-white/[0.08]"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{stylePreset.name}</span>
                    {(() => {
                      const meta = getSavedStyleMeta(stylePreset);
                      return (
                        <span className="mt-1 block space-y-0.5 text-[11px] text-white/40">
                          <span className="block">{`${getFontOptionLabel(meta.fontFamily)} / 太さ ${meta.fontWeight} / 行間 ${meta.lineHeight.toFixed(2)}`}</span>
                          <span className="block">{`文字サイズ ${stylePreset.style.fontSize}px / 縁取り ${stylePreset.style.strokeWidth}px / 文字エリアの最大幅 ${Math.round(stylePreset.style.maxWidth)}%`}</span>
                        </span>
                      );
                    })()}
                  </span>
                  <span className="flex items-center gap-2">
                    <span
                      className="h-3.5 w-3.5 rounded-full border border-white/15"
                      style={{ backgroundColor: stylePreset.style.color }}
                    />
                    <span
                      className="h-3.5 w-3.5 rounded-full border border-white/15"
                      style={{ backgroundColor: stylePreset.style.strokeColor }}
                    />
                  </span>
                </button>
              ))
            ) : (
              <div className="rounded-lg border border-dashed border-white/10 p-4 text-sm text-muted-foreground">
                まだ保存したスタイルがありません。
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(telopPendingDeleteId)}
        onOpenChange={(open) => {
          if (!open) setTelopPendingDeleteId(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>テロップを削除</DialogTitle>
            <DialogDescription>
              このテロップ要素を削除します。この操作は元に戻せません。
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setTelopPendingDeleteId(null)}
            >
              キャンセル
            </Button>
            <Button type="button" variant="secondary" onClick={confirmDeleteEditingTelop}>
              削除する
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(existingVideoPendingDelete)}
        onOpenChange={(open) => {
          if (!open) setExistingVideoPendingDelete(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>動画を削除</DialogTitle>
            <DialogDescription>
              {existingVideoPendingDelete
                ? `「${existingVideoPendingDelete.name}」をこのプロジェクトから外します。`
                : "この操作は元に戻せません。"}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setExistingVideoPendingDelete(null)}
            >
              キャンセル
            </Button>
            <Button type="button" variant="secondary" onClick={confirmDeleteExistingVideo}>
              削除する
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {snackbarMessage ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[120] flex justify-center px-4">
          <div className="rounded-lg border border-white/10 bg-[#1c2029]/95 px-4 py-3 text-sm text-white shadow-2xl backdrop-blur">
            {snackbarMessage}
          </div>
        </div>
      ) : null}

    </main>
  );
}
