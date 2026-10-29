import { FaceLoader } from "@/components/FaceLoader";

// In the admin area the header stays put; only the page area shows the loader.
export default function AdminLoading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center" aria-busy="true">
      <FaceLoader />
    </div>
  );
}
