import { Note, Connection } from './types';
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
    file_id: dbRecord.file_id || dbRecord.fileId, // Support both during migration, prefer snake
    hasPin: dbRecord.is_pinned ?? dbRecord.has_pin, // Support both, prefer is_pinned
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
    title: note.title || null, // Ensure explicitly sent as null if missing
    subtitle: note.subtitle || null, // Ensure explicitly sent as null if missing
    board_id: Number(note.board_id), // Strict number
    file_id: note.file_id, // Direct pass-through
    is_pinned: !!note.hasPin, // Strict boolean, mapped to is_pinned
    pin_x: note.pinX ? Math.round(Number(note.pinX)) : null,
    pin_y: note.pinY ? Math.round(Number(note.pinY)) : null,
    x: Math.round(Number(note.x || 0)),
    y: Math.round(Number(note.y || 0)),
    z_index: Number(note.zIndex) || 1,
    rotation: note.rotation ? Number(Number(note.rotation).toFixed(2)) : 0,
    width: note.width ? Math.round(Number(note.width)) : null,
    height: note.height ? Math.round(Number(note.height)) : null,
    scale: Number(note.scale) || 1, // Strict number
  };

  // Only include ID if it's a valid positive number (meaning it exists in DB)
  if (note.id && typeof note.id === 'number' && note.id > 0) {
    dbObj.id = note.id;
  }

  // Add user_id if present (usually for creation)
  if ((note as any).user_id) {
    dbObj.user_id = (note as any).user_id;
  }

  return dbObj;
};

export const mapDbToConnection = (dbRecord: any): Connection => {
  return {
    id: dbRecord.id,
    sourceId: Number(dbRecord.source_id || 0), // Safety fallback
    targetId: Number(dbRecord.target_id || 0), // Safety fallback
    board_id: dbRecord.board_id,
    color: dbRecord.color
  };
};

export const mapConnectionToDb = (conn: Partial<Connection>): any => {
  const dbObj: any = {
    source_id: Number(conn.sourceId),
    target_id: Number(conn.targetId),
    board_id: Number(conn.board_id),
    color: conn.color
  };

  // Only include ID if it's a valid positive number
  if (conn.id && typeof conn.id === 'number' && conn.id > 0) {
    dbObj.id = conn.id;
  }

  return dbObj;
};

/**
 * 在执行数据库插入前清理对象，移除主键 ID 并确保类型正确 (Prevent auto-increment conflict)
 */
export const sanitizeNoteForInsert = (note: any) => {
  // 1. 彻底剔除 id，让数据库自增主键接管 (Implicitly handled by not including it in the return object)

  // 2. Strict Whitelist & Type Coercion
  return {
    board_id: Number(note.board_id),
    user_id: note.user_id, // UUID string
    x: Math.round(Number(note.x || 0)),
    y: Math.round(Number(note.y || 0)),
    width: note.width ? Math.round(Number(note.width)) : null,
    height: note.height ? Math.round(Number(note.height)) : null,
    title: note.title || null,
    subtitle: note.subtitle || null,
    content: note.content || '',
    type: note.type,
    file_id: note.file_id || null, // Ensure explicitly handled
    is_pinned: Boolean(note.is_pinned), // Explicit boolean
    pin_x: note.pin_x ? Math.round(Number(note.pin_x)) : null,
    pin_y: note.pin_y ? Math.round(Number(note.pin_y)) : null,
    z_index: Math.round(Number(note.z_index || 0)), // Integer
    rotation: Number(Number(note.rotation || 0).toFixed(2)), // Number
    scale: Number(note.scale || 1) // Number
  };
};

export const sanitizeConnectionForInsert = (conn: any) => {
  return {
    source_id: Number(conn.source_id || conn.sourceId), // Support both raw DB obj or frontend obj
    target_id: Number(conn.target_id || conn.targetId),
    board_id: Number(conn.board_id),
    color: conn.color || '#666'
  };
};