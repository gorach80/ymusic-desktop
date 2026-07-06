import { Track } from "./music";

const FOLDER_ID = "16ReqHE6NXCP-gdi7joljWlRxKb4nf0v_";
const TOKEN_KEY = "ymusic_gdrive_token";

export function saveGDriveToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token.trim());
}

export function getGDriveToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function clearGDriveToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export async function listGDriveMusic(): Promise<Track[] | null> {
  const token = getGDriveToken();
  if (!token) return null;

  const url = `https://www.googleapis.com/drive/v3/files?q='${FOLDER_ID}'+in+parents+and+mimeType+contains+'audio/'&fields=files(id,name,mimeType,size)&key=`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.status === 401) {
      // Token expired or invalid
      clearGDriveToken();
      return null;
    }

    if (!response.ok) {
      throw new Error(`Google Drive API error: ${response.statusText}`);
    }

    const data = await response.json();
    if (data.files && Array.isArray(data.files)) {
      return data.files.map((file: any) => {
        // Strip file extensions like .mp3, .wav for cleaner titles
        const cleanTitle = file.name.replace(/\.[^/.]+$/, "");
        
        // Stream URL using access_token query param for native HTML5 audio playback support
        const streamUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&access_token=${token}`;

        return {
          id: `gdrive-${file.id}`,
          title: cleanTitle,
          artist: "Google Drive (MUSICA)",
          url: streamUrl,
        };
      });
    }
  } catch (error) {
    console.error("Error fetching audio files from Google Drive:", error);
    throw error;
  }

  return [];
}
