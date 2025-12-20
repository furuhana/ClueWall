import React, { useState, useEffect } from 'react';
import { Note } from '../types';
import { X, Upload, Loader2 } from 'lucide-react';
import { uploadToGAS } from '../api';
import { supabase } from '../supabaseClient';

interface EditModalProps {
  note: Note;
  onSave: (updatedNote: Note) => void;
  onClose: () => void;
}

const EditModal: React.FC<EditModalProps> = ({ note, onSave, onClose }) => {
  const [content, setContent] = useState(note.content);
  const [title, setTitle] = useState(note.title || "");
  const [subtitle, setSubtitle] = useState(note.subtitle || "");
  const [previewImage, setPreviewImage] = useState(note.file_id || note.fileId); // Support both during migration, prefer snake
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  // 🟢 核心修复：上传逻辑
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setIsUploading(true);

      try {
        // 1. Get User Info
        const { data: { user } } = await supabase.auth.getUser();
        const userId = user?.id;
        const userName = user?.email || 'AnonymousAgent';

        if (!userId) {
          alert("Upload failed: No active session. Please login.");
          return;
        }

        // 2. Read Base64
        const base64Data = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });

        // 3. Upload to GAS
        const result = await uploadToGAS({
          userId,
          userName,
          fileName: file.name,
          contentType: file.type,
          base64Data
        });

        if (result && result.status === 'success') {
          // 🟢 GET REAL URL FROM GAS RESPONSE
          // Support both 'url' (standard) and 'fileUrl' (legacy/mapped)
          const finalUrl = result.url || result.fileUrl;

          if (finalUrl) {
            setPreviewImage(finalUrl);
            console.log("Image uploaded, URL:", finalUrl);
          } else {
            // Fallback if URL missing (shouldn't happen with updated GAS)
            const localUrl = URL.createObjectURL(file);
            setPreviewImage(localUrl);
            alert("Warning: Upload successful but no URL returned. Using local preview.");
          }
        } else {
          alert("上传失败 (CORS Error)。请检查 Google Apps Script 部署权限是否为 'Anyone'。");
        }
      } catch (error) {
        console.error(error);
        alert("上传出错");
      } finally {
        setIsUploading(false);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...note,
      content,
      title: title || undefined,
      subtitle: subtitle || undefined,
      file_id: previewImage,
    });
  };

  const isPhotoType = note.type === 'photo' || note.type === 'evidence';
  const isDossier = note.type === 'dossier';

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-gray-100 w-full max-w-md rounded-lg shadow-2xl border-2 border-gray-400 flex flex-col max-h-[90vh]">
        <div className="bg-gray-800 text-white p-3 flex justify-between items-center rounded-t-lg">
          <h2 className="font-bold uppercase tracking-widest text-sm flex items-center gap-2">Edit {note.type}</h2>
          <button onClick={onClose} className="hover:text-red-400 transition-colors"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4 overflow-y-auto">
          {isDossier && (
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1"><label className="text-xs font-bold text-gray-500 uppercase">Tab Label</label><input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="p-2 border border-gray-300 rounded outline-none" /></div>
              <div className="flex flex-col gap-1"><label className="text-xs font-bold text-gray-500 uppercase">File Label</label><input type="text" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} className="p-2 border border-gray-300 rounded outline-none" /></div>
            </div>
          )}
          {isPhotoType && (
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-gray-500 uppercase">Visual Evidence</label>
              <div className="relative group w-full h-48 bg-gray-200 rounded overflow-hidden border border-gray-300 flex items-center justify-center">
                {isUploading ? (
                  <div className="flex flex-col items-center text-gray-500"><Loader2 className="animate-spin mb-2" size={32} /><span className="text-xs font-mono">UPLOADING...</span></div>
                ) : previewImage ? (
                  <img src={previewImage} alt="Preview" className="w-full h-full object-contain" />
                ) : (
                  <span className="text-gray-400 text-sm">No Image</span>
                )}
                {!isUploading && (
                  <label className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                    <Upload size={24} className="mb-2" /><span className="text-xs font-bold">UPLOAD</span>
                    <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                  </label>
                )}
              </div>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-gray-500 uppercase">Content</label>
            <textarea value={content} onChange={(e) => setContent(e.target.value)} className="p-3 border border-gray-300 rounded min-h-[100px] font-handwriting text-lg outline-none resize-none" />
          </div>
          <button type="submit" disabled={isUploading} className={`mt-2 font-bold py-3 rounded shadow-md uppercase text-white ${isUploading ? 'bg-gray-400' : 'bg-red-700 hover:bg-red-800'}`}>{isUploading ? 'Wait...' : 'Update'}</button>
        </form>
      </div>
    </div>
  );
};
export default EditModal;