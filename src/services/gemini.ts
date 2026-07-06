import { getClient, Body } from "@tauri-apps/api/http";
import { invoke } from "@tauri-apps/api/tauri";

export interface SemanticResult {
  searchQuery: string;
  detectedMood: string;
  genres: string[];
}

export async function getSemanticQuery(prompt: string): Promise<SemanticResult | null> {
  const requestBody = {
    contents: [{
      parts: [{
        text: `Analiza la siguiente solicitud de música y genera una consulta estructurada optimizada para buscar canciones en la API de Deezer.
        Solicitud del usuario: "${prompt}"`
      }]
    }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          searchQuery: {
            type: "STRING",
            description: "Optimized plain text search query to find relevant music on Deezer (e.g. 'lofi sleep study', 'rock high energy', 'jazz instrumental'). Do not include extra keywords like 'deezer' or syntax."
          },
          detectedMood: {
            type: "STRING",
            description: "Short mood identifier (e.g. 'Relaxed', 'Energetic', 'Focused', 'Sad')."
          },
          genres: {
            type: "ARRAY",
            items: { type: "STRING" },
            description: "List of detected musical genres."
          }
        },
        required: ["searchQuery", "detectedMood", "genres"]
      }
    }
  };

  try {
    // 1. Fetch key from Rust backend
    const apiKey = await invoke<string>("get_api_key");
    
    // 2. Fetch using Tauri's native HTTP client
    const client = await getClient();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    
    const response = await client.post<any>(
      url,
      Body.json(requestBody),
      {
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
    
    if (response.status === 200 && response.data) {
      const candidates = response.data.candidates;
      if (candidates && candidates.length > 0) {
        const textContent = candidates[0].content.parts[0].text;
        const parsed = JSON.parse(textContent) as SemanticResult;
        return parsed;
      }
    }
  } catch (error) {
    console.warn("Tauri invoke o HTTP Client falló en Gemini. Probando fetch estándar de respaldo...", error);
    try {
      const savedKey = localStorage.getItem("gemini_api_key") || "";
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${savedKey}`;
      
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody)
      });
      
      const data = await response.json();
      if (data && data.candidates && data.candidates.length > 0) {
        const textContent = data.candidates[0].content.parts[0].text;
        const parsed = JSON.parse(textContent) as SemanticResult;
        return parsed;
      }
    } catch (fetchError) {
      console.error("Error al obtener consulta semántica por fetch estándar:", fetchError);
    }
  }

  // Local semantic heuristics fallback (offline/no-key helper)
  return getLocalHeuristics(prompt);
}

function getLocalHeuristics(prompt: string): SemanticResult {
  const lower = prompt.toLowerCase();
  let searchQuery = prompt;
  let detectedMood = "Mix";
  let genres = ["General"];
  
  if (lower.includes("jazz") || lower.includes("café")) {
    searchQuery = "jazz instrumental background";
    detectedMood = "Relaxed";
    genres = ["Jazz", "Instrumental"];
  } else if (lower.includes("lofi") || lower.includes("estudiar") || lower.includes("programar") || lower.includes("python")) {
    searchQuery = "lofi focus study";
    detectedMood = "Focused";
    genres = ["Lofi", "Electronic"];
  } else if (lower.includes("rock") || lower.includes("entrenar") || lower.includes("energia")) {
    searchQuery = "hard rock energetic";
    detectedMood = "Energetic";
    genres = ["Rock", "Metal"];
  } else if (lower.includes("triste") || lower.includes("lluvia")) {
    searchQuery = "sad acoustic songs";
    detectedMood = "Sad";
    genres = ["Acoustic", "Indie"];
  }
  
  return { searchQuery, detectedMood, genres };
}
