export type TelopPreset = "impact" | "soft" | "editorial";

export type TelopStyle = {
  text: string;
  fontFamily: string;
  fontWeight: number;
  fontSize: number;
  x: number;
  y: number;
  maxWidth: number;
  lineHeight: number;
  color: string;
  strokeColor: string;
  strokeWidth: number;
  shadow: boolean;
  align: CanvasTextAlign;
  preset: TelopPreset;
};

export type TelopItem = TelopStyle & {
  id: string;
};

export type SavedTelopStylePreset = {
  id: string;
  name: string;
  style: Pick<
    TelopStyle,
    "maxWidth" | "fontSize" | "strokeWidth" | "color" | "strokeColor" | "fontFamily" | "fontWeight" | "lineHeight"
  >;
  createdAt: string;
};

export type StorySummarySection = {
  time: number;
  title: string;
  summary: string;
};

export type StoryboardPanelSuggestion = {
  time: number;
  shot: ScreenshotCandidate;
  title: string;
  summary: string;
  shotDirection: string;
  recommendedTelop: string;
};

export type StorySummaryDetail = {
  time: number;
  title: string;
  summary: string;
  panels: StoryboardPanelSuggestion[];
};

export type ScreenshotCandidate = {
  id: string;
  time: number;
  score: number;
  dataUrl: string;
  width: number;
  height: number;
  imageScale?: number;
  imageOffsetX?: number;
  imageOffsetY?: number;
  overlayImageDataUrl?: string | null;
  overlayScale?: number;
  overlayX?: number;
  overlayY?: number;
  overlayRotation?: number;
  telops?: TelopItem[];
  selectedTelopId?: string | null;
  telop?: TelopStyle;
};

export type HighlightConditions = {
  sceneTone: "any" | "bright" | "dark" | "vivid" | "high-contrast";
  faceFilter: "any" | "face" | "no-face";
  textAmount: "any" | "low" | "high";
  noTelop: boolean;
  diversity: "standard" | "wide";
};

export type CandidateGroup = {
  id: string;
  label: string;
  conditions: HighlightConditions | null;
  shots: ScreenshotCandidate[];
};

export type ThreadItem = ScreenshotCandidate & {
  createdAt: string;
};

export type SavedVideoSession = {
  id: string;
  name: string;
  file: Blob | null;
  candidateShots: ScreenshotCandidate[];
  candidateGroups?: CandidateGroup[];
  currentCandidateGroupId?: string | null;
  selectedShots: ScreenshotCandidate[];
  progress: number;
  isAnalyzing: boolean;
  status: string;
  storySummary?: StorySummarySection[];
  storyDetails?: StorySummaryDetail[];
};

export type ScenePeakSegment = {
  id: string;
  videoId: string;
  videoName: string;
  peakTime: number;
  rangeStart: number;
  rangeEnd: number;
  thumbnailShot: ScreenshotCandidate;
};

export type SavedThread = {
  id: string;
  title: string;
  videoName: string;
  createdAt: string;
  updatedAt?: string;
  currentVideoId?: string | null;
  videos?: SavedVideoSession[];
  sceneSegments?: ScenePeakSegment[];
  items: ThreadItem[];
};
