import { FaceLoader } from "@/components/FaceLoader";

// Shown while a page is being prepared (between pages and on slow connections).
export default function Loading() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center" aria-busy="true">
      <FaceLoader />
    </div>
  );
}
