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