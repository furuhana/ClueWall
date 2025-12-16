import { Note, Connection } from './types';

export const INITIAL_NOTES: Note[] = [
  {
    id: 'n1',
    type: 'photo',
    content: 'Suspect spotted leaving the scene.',
    fileId: '/photo_1.png',
    x: 100,
    y: 100,
    zIndex: 1,
    rotation: -5,
    hasPin: false,
    width: 256,
    height: 280,
    scale: 1
  },
  {
    id: 'n2',
    type: 'dossier',
    content: 'CONFIDENTIAL: Project Blue Book',
    x: 500,
    y: 150,
    zIndex: 2,
    rotation: 2,
    hasPin: false,
    width: 256,
    height: 224, // Fix: 200 (min-h) + 24 (pt-6)
    scale: 1
  },
  {
    id: 'n3',
    type: 'note',
    content: 'Call the precinct at 0800 hours. Don\'t trust the rookie.',
    x: 300,
    y: 400,
    zIndex: 3,
    rotation: 4,
    hasPin: false,
    width: 256,
    height: 160, // Matches CSS min-h-[160px]
    scale: 1
  },
  {
    id: 'n4',
    type: 'scrap',
    content: '...found on 4th street...',
    x: 700,
    y: 350,
    zIndex: 4,
    rotation: -10,
    hasPin: false,
    width: 257, // Changed default to 257
    height: 50, // Changed default to 50
    scale: 1
  },
  {
    id: 'm1',
    type: 'marker',
    content: '1',
    x: 60,
    y: 60,
    zIndex: 5,
    rotation: 0,
    hasPin: false,
    width: 30,
    height: 30,
    scale: 1
  },
];

export const INITIAL_CONNECTIONS: Connection[] = [];

export const NODE_WIDTH = 256; // Standard width for calculation
// Calculated: Pin is at -top-6 (-24px). Pin height 32px. Center is -24 + 16 = -8px relative to note top.
export const PIN_OFFSET_Y = -8;