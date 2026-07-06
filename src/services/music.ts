import { getClient } from "@tauri-apps/api/http";

export interface Track {
  id: string;
  title: string;
  artist: string;
  url: string;
}

export async function searchTracks(query: string): Promise<Track[]> {
  try {
    const client = await getClient();
    const response = await client.get<any>("https://api.deezer.com/search?q=" + encodeURIComponent(query));
    if (response.status === 200 && response.data && response.data.data) {
      return response.data.data.map((item: any) => ({
        id: item.id.toString(),
        title: item.title,
        artist: item.artist.name,
        url: item.preview
      }));
    }
  } catch (error) {
    console.warn("Tauri HTTP Client no disponible. Intentando fallback con fetch estándar...", error);
    try {
      const response = await fetch("https://api.deezer.com/search?q=" + encodeURIComponent(query));
      const data = await response.json();
      if (data && data.data) {
        return data.data.map((item: any) => ({
          id: item.id.toString(),
          title: item.title,
          artist: item.artist.name,
          url: item.preview
        }));
      }
    } catch (fetchError) {
      console.error("Error al obtener canciones por fetch normal:", fetchError);
      
      // Fallback local mock tracks to verify player works offline or in normal browser (CORS blocked)
      return [
        {
          id: "mock-1",
          title: `${query} (Preview Track 1)`,
          artist: "Tauri Mock Artist",
          url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3"
        },
        {
          id: "mock-2",
          title: `${query} (Preview Track 2)`,
          artist: "Tauri Mock Artist",
          url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3"
        }
      ];
    }
  }
  return [];
}
