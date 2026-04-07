import dynamic from "next/dynamic";

const VideoThreadStudio = dynamic(
  () => import("@/components/video-thread-studio").then((mod) => mod.VideoThreadStudio),
  { ssr: false }
);

export default function Page() {
  return <VideoThreadStudio />;
}
