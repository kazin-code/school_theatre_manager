import { getBranding } from "@/server/settings";
import { accentCss } from "@/lib/accent";

/** Sign-in screens: the school's logo on a stage curtain beside the form. */
export async function AuthFrame({ children }: { children: React.ReactNode }) {
  const b = await getBranding();
  return (
    <div className="grid min-h-svh md:grid-cols-2">
      {b.accent && <style>{accentCss(b.accent)}</style>}
      <div className="relative flex flex-col items-center justify-center gap-4 overflow-hidden bg-neutral-950 p-10 text-center text-white">
        <div aria-hidden className="absolute inset-y-0 left-0 w-1/5 bg-[repeating-linear-gradient(90deg,#7d0f19_0_14px,#a31622_14px_26px,#8a111c_26px_38px)]" />
        <div aria-hidden className="absolute inset-y-0 right-0 w-1/5 bg-[repeating-linear-gradient(90deg,#7d0f19_0_14px,#a31622_14px_26px,#8a111c_26px_38px)]" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/branding/logo${b.logoVersion ? `?v=${b.logoVersion}` : ""}`} alt={`${b.name} logo`} className="relative size-36 rounded-2xl bg-white object-contain p-2 md:size-44" />
        <h1 className="relative text-2xl font-semibold md:text-3xl">{b.name}</h1>
        {b.school && b.school !== b.name && <p className="relative tracking-wide">{b.school}</p>}
        <p className="relative max-w-[30ch] text-sm text-neutral-300">{b.tagline || "Shows, cast and crew, costumes, props and set pieces: what we own, where it is, and every production it has been part of."}</p>
      </div>
      <div className="flex items-center justify-center p-6">{children}</div>
    </div>
  );
}
