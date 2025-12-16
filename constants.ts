import { Note, Connection } from './types';

export const INITIAL_NOTES: Note[] = [
  {
    id: 'n1',
    type: 'photo',
    content: 'Suspect spotted leaving the scene.',
    fileId: '/photo_1.png',
    x: 400,
    y: 50,
    zIndex: 1,
    rotation: -3,
    hasPin: false,
    width: 256,
    height: 280,
    scale: 1
  },
  {
    id: 'n2',
    type: 'dossier',
    content: 'CONFIDENTIAL: Project Blue Book',
    x: 150,
    y: 350,
    zIndex: 2,
    rotation: 2,
    hasPin: false,
    width: 256,
    height: 224,
    scale: 1
  },
  {
    id: 'n3',
    type: 'note',
    content: 'Call the precinct at 0800 hours. Don\'t trust the rookie.',
    x: 100,
    y: 100,
    zIndex: 3,
    rotation: 5,
    hasPin: true,
    width: 256,
    height: 160,
    scale: 1
  },
  {
    id: 'n4',
    type: 'scrap',
    content: '...found on 4th street...',
    x: 480,
    y: 400,
    zIndex: 4,
    rotation: -8,
    hasPin: false,
    width: 257,
    height: 50,
    scale: 1
  },
  {
    id: 'm1',
    type: 'marker',
    content: '1',
    x: 650,
    y: 150,
    zIndex: 5,
    rotation: 0,
    hasPin: true,
    width: 30,
    height: 30,
    scale: 1
  }
];

export const INITIAL_CONNECTIONS: Connection[] = [
  {
    id: 'conn-1',
    sourceId: 'n3',
    targetId: 'm1',
    color: '#D43939' // Red
  }
];

export const NODE_WIDTH = 256; 
export const PIN_OFFSET_Y = -8;