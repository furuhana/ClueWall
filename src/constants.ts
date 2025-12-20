import { Note, Connection } from './types';

export const INITIAL_NOTES: Note[] = [
  {
    id: 1,
    type: 'photo',
    content: 'Suspect spotted leaving the scene.',
    file_id: '/photo_1.png',
    x: 875,
    y: 244,
    zIndex: 1,
    rotation: -4,
    hasPin: false,
    width: 256,
    height: 280,
    scale: 1
  },
  {
    id: 2,
    type: 'dossier',
    content: 'CONFIDENTIAL: Project Blue Book',
    x: 636,
    y: 545,
    zIndex: 2,
    rotation: 2,
    hasPin: false,
    width: 256,
    height: 224,
    scale: 1
  },
  {
    id: 3,
    type: 'note',
    content: 'Call the precinct at 0800 hours. Don\'t trust the rookie.',
    x: 530,
    y: 279,
    zIndex: 3,
    rotation: 5,
    hasPin: true,
    pinX: 238,
    pinY: 19,
    width: 256,
    height: 160,
    scale: 1
  },
  {
    id: 4,
    type: 'scrap',
    content: '...found on 4th street...',
    x: 940,
    y: 602,
    zIndex: 4,
    rotation: -17,
    hasPin: false,
    width: 257,
    height: 50,
    scale: 1
  },
  {
    id: 5,
    type: 'marker',
    content: '1',
    x: 1203,
    y: 487,
    zIndex: 5,
    rotation: 0,
    hasPin: true,
    pinX: 0,
    pinY: 24,
    width: 30,
    height: 30,
    scale: 1
  }
];

export const INITIAL_CONNECTIONS: Connection[] = [
  {
    id: 1,
    sourceId: 3,
    targetId: 5,
    color: '#D43939' // Red
  }
];

export const NODE_WIDTH = 256;
export const PIN_OFFSET_Y = -8;