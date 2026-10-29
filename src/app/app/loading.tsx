import { FaceLoader } from "@/components/FaceLoader";

// Inside the app the menu stays put; only the page area shows the loader.
export default function AppLoading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center" aria-busy="true">
      <FaceLoader />
    </div>
  );
}
