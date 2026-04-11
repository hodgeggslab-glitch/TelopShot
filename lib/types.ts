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
  backgroundColor?: string | null;
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

export type ShotFilterType = "telop" | "person-count";

export type ShotFilterCondition = {
  type: ShotFilterType;
  value: string;
  label: string;
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

export type SnsLayoutType = "single" | "two-horizontal" | "two-vertical" | "four-grid";

export type SnsSlide = {
  id: string;
  headerLine1?: string;
  headerLine2?: string;
  headerLine1Color?: string;
  headerLine2Color?: string;
  layout: SnsLayoutType;
  slots: (string | null)[];
};

export type SnsPlatform = "youtube" | "instagram" | "tiktok" | "x";

export type SnsTemplate = {
  id: string;
  projectId?: string | null;
  name: string;
  platform: SnsPlatform;
  slides: SnsSlide[];
  createdAt: string;
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
