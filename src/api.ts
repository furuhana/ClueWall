import { Note, Connection } from './types';
// 🟢 修改点：对齐文件名 apiConfig 和导出的 API_CONFIG
import { API_CONFIG } from './apiConfig'; 

const API_URL = API_CONFIG.VITE_API_URL;

if (!API_URL) {
  console.error("❌ 严重错误: 未找到 API 配置！请检查 src/apiConfig.ts 中的 VITE_API_URL");
}

// 获取所有数据
export const fetchBoardData = async () => {
  if (!API_URL) return null;
  try {
    const response = await fetch(`${API_URL}?action=getAll`);
    return await response.json(); 
  } catch (error) {
    console.error("Fetch Data Error:", error);
    return null;
  }
};

// 保存数据 (GAS 备份)
export const saveBoardData = async (notes: Note[], connections: Connection[]) => {
  if (!API_URL) return;
  fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify({ action: 'saveBoard', notes, connections })
  }).catch(e => console.error("GAS Save Error:", e));
};

// 上传图片到 Google Drive
export const uploadImage = async (file: File): Promise<string | null> => {
  if (!API_URL) return null;
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async () => {
      const base64 = reader.result as string;
      try {
        const response = await fetch(API_URL, {
          method: 'POST',
          body: JSON.stringify({ action: 'uploadImage', base64, filename: file.name })
        });
        const data = await response.json();
        if (data && data.status === 'success') {
          resolve(data.fileUrl || data.fileId);
        } else {
          resolve(null);
        }
      } catch (e) {
        console.error("Upload failed:", e);
        resolve(null);
      }
    };
  });
};

// 删除 Drive 图片
export const deleteImageFromDrive = async (fileIdOrUrl: string) => {
  if (!API_URL || !fileIdOrUrl) return;
  try {
    console.log("正在从 Drive 删除图片:", fileIdOrUrl);
    await fetch(API_URL, {
      method: 'POST',
      mode: 'no-cors', 
      body: JSON.stringify({ action: 'deleteImage', fileId: fileIdOrUrl })
    });
  } catch (error) {
    console.error("Delete failed:", error);
  }
};