import { Track } from "./music";

const ROOT_FOLDER_ID = "16ReqHE6NXCP-gdi7joljWlRxKb4nf0v_";
const TOKEN_KEY = "ymusic_gdrive_token";

// Maps parent folder ID -> Google Drive text file ID and name for lyrics extraction
export const gdriveLyricsMap = new Map<string, { id: string; name: string }>();

export function saveGDriveToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token.trim());
}

export function getGDriveToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function clearGDriveToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

// Paginated API fetch helper to retrieve ALL results recursively
async function fetchAllFiles(token: string, query: string, fields: string): Promise<any[]> {
  let allFiles: any[] = [];
  let nextPageToken: string | null = null;
  
  do {
    let url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=nextPageToken,files(${fields})&pageSize=1000`;
    if (nextPageToken) {
      url += `&pageToken=${nextPageToken}`;
    }
    
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    
    if (response.status === 401) {
      throw new Error("UNAUTHORIZED");
    }
    
    if (!response.ok) {
      throw new Error(`Google API error: ${response.statusText}`);
    }
    
    const data = await response.json();
    if (data.files && Array.isArray(data.files)) {
      allFiles = allFiles.concat(data.files);
    }
    nextPageToken = data.nextPageToken || null;
  } while (nextPageToken);
  
  return allFiles;
}

export async function listGDriveMusic(): Promise<Track[] | null> {
  const token = getGDriveToken();
  if (!token) return null;

  try {
    // Reset lyrics map
    gdriveLyricsMap.clear();

    // 1. Fetch ALL folders to map the directory hierarchy
    const foldersQuery = "mimeType='application/vnd.google-apps.folder' and trashed=false";
    let folders: any[];
    
    try {
      folders = await fetchAllFiles(token, foldersQuery, "id,parents");
    } catch (e: any) {
      if (e.message === "UNAUTHORIZED") {
        clearGDriveToken();
        return null;
      }
      throw e;
    }

    const folderParentMap = new Map<string, string>(); // childFolderId -> parentFolderId
    folders.forEach((folder) => {
      if (folder.parents && folder.parents.length > 0) {
        folderParentMap.set(folder.id, folder.parents[0]);
      }
    });

    // 2. Fetch ALL audio and text/lyric files
    const queryStr = "(mimeType contains 'audio/' or mimeType = 'text/plain' or name contains 'mp3' or name contains 'wav' or name contains 'm4a' or name contains 'flac' or name contains 'txt' or name contains 'lrc') and trashed=false";
    const files = await fetchAllFiles(token, queryStr, "id,name,mimeType,size,parents");

    const filteredTracks: Track[] = [];

    // Helper: recursively check if a folder ID is a descendant of the ROOT_FOLDER_ID
    function isDescendantOfRoot(folderId: string, visited = new Set<string>()): boolean {
      if (folderId === ROOT_FOLDER_ID) return true;
      if (visited.has(folderId)) return false; // Prevent infinite loops
      visited.add(folderId);

      const parentId = folderParentMap.get(folderId);
      if (parentId) {
        return isDescendantOfRoot(parentId, visited);
      }
      return false;
    }

    // Helper: check if a file belongs to the root folder or any of its subfolders
    function isFileInRootHierarchy(parents: string[] | undefined): boolean {
      if (!parents || parents.length === 0) return false;
      for (const parentId of parents) {
        if (isDescendantOfRoot(parentId)) {
          return true;
        }
      }
      return false;
    }

    // 3. Process files (map audio to tracks, map text to lyrics directory)
    files.forEach((file: any) => {
      const lowerName = file.name.toLowerCase();
      const isText = lowerName.endsWith(".txt") || lowerName.endsWith(".lrc") || file.mimeType === "text/plain";
      
      if (isText && isFileInRootHierarchy(file.parents)) {
        const parentId = file.parents[0];
        // Index the text file as the lyrics provider for this subfolder
        gdriveLyricsMap.set(parentId, { id: file.id, name: file.name });
      } else {
        const hasAudioExtension = lowerName.endsWith(".mp3") || 
                                  lowerName.endsWith(".wav") || 
                                  lowerName.endsWith(".m4a") || 
                                  lowerName.endsWith(".flac") || 
                                  file.mimeType.includes("audio/");
                                  
        if (hasAudioExtension && isFileInRootHierarchy(file.parents)) {
          const cleanTitle = file.name.replace(/\.[^/.]+$/, "");
          const streamUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&access_token=${token}`;

          filteredTracks.push({
            id: `gdrive-${file.id}`,
            title: cleanTitle,
            artist: "Google Drive (MUSICA)",
            url: streamUrl,
            folderId: file.parents[0], // Save parent folder ID for lyrics lookup
          });
        }
      }
    });

    return filteredTracks;

  } catch (error) {
    console.error("Error fetching audio and text files from Google Drive:", error);
    throw error;
  }
}

// Fetch the text contents of a Google Drive lyrics file in a subfolder
export async function fetchGDriveLyrics(folderId: string): Promise<string | null> {
  const token = getGDriveToken();
  const info = gdriveLyricsMap.get(folderId);
  if (!token || !info) return null;

  try {
    const url = `https://www.googleapis.com/drive/v3/files/${info.id}?alt=media`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.ok) {
      return await response.text();
    }
  } catch (e) {
    console.error("Error fetching lyrics content from Google Drive file:", e);
  }
  return null;
}
