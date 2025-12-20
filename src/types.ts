export type NoteType = 'note' | 'photo' | 'scrap' | 'dossier' | 'evidence' | 'marker';

export interface Note {
  id: number;
  type: NoteType;
  content: string;
  title?: string; // For Dossier (e.g., "Top Secret")
  subtitle?: string; // For Dossier (e.g., "Case File")
  board_id?: number; // Optional reference to parent board
  file_id?: string; // URL for image or ID (snake_case per DB)
  hasPin?: boolean; // Whether the note has a pin attached
  pinX?: number; // Relative X position of the pin (from left)
  pinY?: number; // Relative Y position of the pin (from top)
  x: number;
  y: number;
  zIndex: number;
  rotation: number;
  width?: number; // Optional custom width
  height?: number; // Optional custom height
  scale?: number; // Zoom/Scale factor for text content
}

export interface Connection {
  id: number;
  sourceId: number;
  targetId: number;
  board_id?: number;
  color: string;
}

export interface DragOffset {
  x: number;
  y: number;
}

export interface Board {
  id: number;
  name: string;
  created_at?: string;
  user_id?: string;
}