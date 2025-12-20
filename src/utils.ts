import { Note } from './types';
import { NODE_WIDTH } from './constants';

export const getNoteDimensions = (note: Note) => {
  // If we have measured dimensions, use them
  if (note.width && note.height) {
    return { width: note.width, height: note.height };
  }

  // Fallback defaults based on type (Approximations for initial render)
  let width = note.width || NODE_WIDTH;
  let height = 200;

  switch (note.type) {
    case 'photo':
      height = 280; // Image (192) + Padding + Text
      break;
    case 'evidence':
      height = 200;
      break;
    case 'dossier':
      height = 224; // Fix: 200 min-height + 24 padding
      break;
    case 'scrap':
      height = 50; // Matches CSS min-h-[50px]
      break;
    case 'marker':
      width = 30;
      height = 30;
      break;
    case 'note':
    default:
      height = 160; // Matches CSS min-h-[160px]
      break;
  }

  return { width, height };
};

// --- DB Mapping Utils ---

export const mapDbToNote = (dbRecord: any): Note => {
  return {
    id: dbRecord.id, // DB is source of truth for ID
    type: dbRecord.type,
    content: dbRecord.content,
    title: dbRecord.title,
    subtitle: dbRecord.subtitle,
    board_id: dbRecord.board_id,
    fileId: dbRecord.file_id, // snake_case -> camelCase
    hasPin: dbRecord.has_pin,
    pinX: dbRecord.pin_x,
    pinY: dbRecord.pin_y,
    x: Number(dbRecord.x), // Enforce number
    y: Number(dbRecord.y), // Enforce number
    zIndex: dbRecord.z_index ?? dbRecord.zIndex ?? 1, // Handle both just in case, prioritize snake
    rotation: Number(dbRecord.rotation),
    width: dbRecord.width ? Number(dbRecord.width) : undefined,
    height: dbRecord.height ? Number(dbRecord.height) : undefined,
    scale: dbRecord.scale ? Number(dbRecord.scale) : 1,
  };
};

export const mapNoteToDb = (note: Partial<Note>): any => {
  // If ID is negative (temp), we might want to exclude it if creating, 
  // but this function just maps fields. Caller decides whether to include 'id'.
  const dbObj: any = {
    type: note.type,
    content: note.content,
    title: note.title,
    subtitle: note.subtitle,
    board_id: note.board_id,
    file_id: note.fileId, // camelCase -> snake_case
    has_pin: note.hasPin,
    pin_x: note.pinX ? Math.round(note.pinX) : null,
    pin_y: note.pinY ? Math.round(note.pinY) : null,
    x: Math.round(note.x || 0),
    y: Math.round(note.y || 0),
    z_index: note.zIndex,
    rotation: note.rotation ? Number(note.rotation.toFixed(2)) : 0,
    width: note.width ? Math.round(note.width) : null,
    height: note.height ? Math.round(note.height) : null,
    scale: note.scale || 1,
  };

  // Only include ID if it's a valid positive number (meaning it exists in DB)
  if (note.id && note.id > 0) {
    dbObj.id = note.id;
  }

  // Add user_id if present (usually for creation)
  if ((note as any).user_id) {
    dbObj.user_id = (note as any).user_id;
  }

  return dbObj;
};