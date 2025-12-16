export type NoteType = 'note' | 'photo' | 'scrap' | 'dossier' | 'evidence' | 'marker';

export interface Note {
  id: string;
  type: NoteType;
  content: string;
  title?: string; // For Dossier (e.g., "Top Secret")
  subtitle?: string; // For Dossier (e.g., "Case File")
  fileId?: string; // URL for image or ID
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
  id: string;
  sourceId: string;
  targetId: string;
  color: string;
}

export interface DragOffset {
  x: number;
  y: number;
}