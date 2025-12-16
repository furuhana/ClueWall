import React, { useState, useEffect } from 'react';
import { Note } from '../types';
import { X, Upload, Loader2 } from 'lucide-react';
import { uploadImage } from '../api'; // 🟢 引入上传函数

interface EditModalProps {
  note: Note;
  onSave: (updatedNote: Note) => void;
  onClose: () => void;
}

const EditModal: React.FC<EditModalProps> = ({ note, onSave, onClose }) => {
  const [content, setContent] = useState(note.content);
  const [title, setTitle] = useState(note.title || "");
  const [subtitle, setSubtitle] = useState(note.subtitle || "");
  
  // 图片相关状态
  const [previewImage, setPreviewImage] = useState(note.fileId);
  const [isUploading, setIsUploading] = useState(false); // 🟢 上传加载状态

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  // 🟢 核心修改：选择文件后立即上传到云端
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      
      setIsUploading(true); // 开始转圈圈
      
      try {
        // 调用我们写的 api.ts 上传到 Google Drive
        const uploadedUrl = await uploadImage(file);
        
        if (uploadedUrl) {
            setPreviewImage(uploadedUrl); // 成功！显示云端链接
        } else {
            alert("上传失败，请检查网络或 Vercel 环境变量配置");
        }
      } catch (error) {
        console.error("Upload error:", error);
        alert("上传发生错误");
      } finally {
        setIsUploading(false); // 停止转圈圈
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
      fileId: previewImage, // 保存的是云端链接
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
                 <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Top Secret" className="p-2 border border-gray-300 rounded focus:border-red-500 outline-none"/>
               </div>
               <div className="flex flex-col gap-1">
                 <label className="text-xs font-bold text-gray-500 uppercase">File Label</label>
                 <input type="text" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="Case File" className="p-2 border border-gray-300 rounded focus:border-red-500 outline-none"/>
               </div>
            </div>
          )}

          {isPhotoType && (
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-gray-500 uppercase">Visual Evidence</label>
              
              {/* 图片预览区域 */}
              <div className="relative group w-full h-48 bg-gray-200 rounded overflow-hidden border border-gray-300 flex items-center justify-center">
                
                {/* 1. 加载中 */}
                {isUploading ? (
                    <div className="flex flex-col items-center text-gray-500">
                        <Loader2 className="animate-spin mb-2" size={32} />
                        <span className="text-xs font-mono">UPLOADING TO SECURE SERVER...</span>
                    </div>
                ) : previewImage ? (
                  // 2. 有图片
                  <img src={previewImage} alt="Preview" className="w-full h-full object-contain" />
                ) : (
                  // 3. 空状态
                  <span className="text-gray-400 text-sm">No Image Selected</span>
                )}

                {/* 上传按钮 (遮罩) */}
                {!isUploading && (
                    <label className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                    <Upload size={24} className="mb-2" />
                    <span className="text-xs font-bold">UPLOAD IMAGE</span>
                    <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                    </label>
                )}
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
            disabled={isUploading} // 上传时禁止保存
            className={`mt-2 font-bold py-3 rounded shadow-md transition-colors uppercase tracking-wider text-white
                ${isUploading ? 'bg-gray-400 cursor-not-allowed' : 'bg-red-700 hover:bg-red-800'}`}
          >
            {isUploading ? 'Uploading...' : 'Update Evidence'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default EditModal;