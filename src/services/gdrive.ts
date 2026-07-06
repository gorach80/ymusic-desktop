import { Track } from "./music";

const ROOT_FOLDER_ID = "16ReqHE6NXCP-gdi7joljWlRxKb4nf0v_";
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

  try {
    // 1. Fetch all folders in the user's Drive to map the directory hierarchy
    const foldersUrl = `https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.folder'&fields=files(id,parents)&pageSize=1000`;
    const foldersResponse = await fetch(foldersUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (foldersResponse.status === 401) {
      clearGDriveToken();
      return null;
    }

    if (!foldersResponse.ok) {
      throw new Error(`Failed to list folders: ${foldersResponse.statusText}`);
    }

    const foldersData = await foldersResponse.json();
    const folderParentMap = new Map<string, string>(); // childFolderId -> parentFolderId

    if (foldersData.files && Array.isArray(foldersData.files)) {
      foldersData.files.forEach((folder: any) => {
        if (folder.parents && folder.parents.length > 0) {
          // Store child-parent relationship
          folderParentMap.set(folder.id, folder.parents[0]);
        }
      });
    }

    // 2. Fetch all audio files in the user's Drive
    const audioUrl = `https://www.googleapis.com/drive/v3/files?q=mimeType+contains+'audio/'&fields=files(id,name,mimeType,size,parents)&pageSize=1000`;
    const audioResponse = await fetch(audioUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!audioResponse.ok) {
      throw new Error(`Failed to list audio files: ${audioResponse.statusText}`);
    }

    const audioData = await audioResponse.json();
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

    // 3. Filter audio files
    if (audioData.files && Array.isArray(audioData.files)) {
      audioData.files.forEach((file: any) => {
        if (isFileInRootHierarchy(file.parents)) {
          const cleanTitle = file.name.replace(/\.[^/.]+$/, "");
          const streamUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&access_token=${token}`;

          filteredTracks.push({
            id: `gdrive-${file.id}`,
            title: cleanTitle,
            artist: "Google Drive (MUSICA)",
            url: streamUrl,
          });
        }
      });
    }

    return filteredTracks;

  } catch (error) {
    console.error("Error fetching audio files recursively from Google Drive:", error);
    throw error;
  }
}
