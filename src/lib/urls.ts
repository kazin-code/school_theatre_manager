export const photoUrl = (f: string) => `/api/files/photos/${encodeURIComponent(f)}`;
export const showFileUrl = (f: string, download = false) => `/api/files/show/${encodeURIComponent(f)}${download ? "?download=1" : ""}`;
export const sponsorUrl = (f: string) => `/api/files/sponsor/${encodeURIComponent(f)}`;
