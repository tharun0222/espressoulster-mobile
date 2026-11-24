import type { Metadata } from "next";
import HomePreview from "./preview";
import "../frosted-home-preview/preview.css";
import "../frosted-home-preview/profile-preview.css";

export const metadata: Metadata = {
  title: "Customer Home preview",
  robots: { index: false, follow: false },
};

export default function HomeDesignPreviewPage() {
  return <HomePreview />;
}
