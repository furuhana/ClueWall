import React, { useState, useEffect } from 'react';
import { Note } from '../types';
import { X, Upload } from 'lucide-react';

interface EditModalProps {
  note: Note;
  onSave: (updatedNote: Note) => void;
  onClose: () => void;
}

const EditModal: React.FC<EditModalProps> = ({ note, onSave, onClose }) => {
  const [content, setContent] = useState(note.content);
  const [title, setTitle] = useState(note.title || "");
  const [subtitle, setSubtitle] = useState(note.subtitle || "");
  const [previewImage, setPreviewImage] = useState(note.fileId);

  // Focus trap could be added here, but simple effect is enough for MVP
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...note,
      content,
      title: title || undefined,
      subtitle: subtitle || undefined,
      fileId: previewImage,
    });
  };

  const isPhotoType = note.type === 'photo' || note.type === 'evidence';
  const isDossier = note.type === 'dossier';

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-gray-100 w-full max-w-md rounded-lg shadow-2xl border-2 border-gray-400 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-gray-800 text-white p-3 flex justify-between items-center rounded-t-lg">
          <h2 className="font-bold uppercase tracking-widest text-sm flex items-center gap-2">
            Edit {note.type}
          </h2>
          <button onClick={onClose} className="hover:text-red-400 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4 overflow-y-auto">
          
          {isDossier && (
            <div className="grid grid-cols-2 gap-4">
               <div className="flex flex-col gap-1">
                 <label className="text-xs font-bold text-gray-500 uppercase">Tab Label</label>
                 <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Top Secret"
                    className="p-2 border border-gray-300 rounded focus:border-red-500 outline-none"
                 />
               </div>
               <div className="flex flex-col gap-1">
                 <label className="text-xs font-bold text-gray-500 uppercase">File Label</label>
                 <input
                    type="text"
                    value={subtitle}
                    onChange={(e) => setSubtitle(e.target.value)}
                    placeholder="Case File"
                    className="p-2 border border-gray-300 rounded focus:border-red-500 outline-none"
                 />
               </div>
            </div>
          )}

          {isPhotoType && (
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-gray-500 uppercase">Visual Evidence</label>
              <div className="relative group w-full h-48 bg-gray-200 rounded overflow-hidden border border-gray-300 flex items-center justify-center">
                {previewImage ? (
                  <img src={previewImage} alt="Preview" className="w-full h-full object-contain" />
                ) : (
                  <span className="text-gray-400 text-sm">No Image Selected</span>
                )}
                <label className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                  <Upload size={24} className="mb-2" />
                  <span className="text-xs font-bold">UPLOAD IMAGE</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                </label>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-gray-500 uppercase">
              {isPhotoType ? 'Description' : 'Content Notes'}
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="p-3 border border-gray-300 rounded min-h-[100px] font-handwriting text-lg focus:border-red-500 outline-none resize-none"
              placeholder="Type investigation details here..."
            />
          </div>

          <button 
            type="submit" 
            className="mt-2 bg-red-700 hover:bg-red-800 text-white font-bold py-3 rounded shadow-md transition-colors uppercase tracking-wider"
          >
            Update Evidence
          </button>
        </form>
      </div>
    </div>
  );
};

export default EditModal;