import { Note, Connection } from './types';
// 🟢【新版结构】使用 apiConfig 确保 Vercel 能读取环境变量
import { API_CONFIG } from './apiConfig';

const API_URL = API_CONFIG.VITE_API_URL;

// 检查配置
if (!API_URL) {
  console.error("❌ 严重错误: 未找到 API 配置！请检查 src/apiConfig.ts 中的 VITE_API_URL");
}

// 🟢 获取所有数据
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

// 🟢 保存数据 (GAS 备份)
export const saveBoardData = async (notes: Note[], connections: Connection[]) => {
  if (!API_URL) return;
  fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify({ action: 'saveBoard', notes, connections })
  }).catch(e => console.error("GAS Save Error:", e));
};

// 🟢 增强版图片上传 (Fixed Payload & Syntax)
// 🟢 增强版图片上传 (Fixed Payload & Syntax & URL)
export const uploadToGAS = async (payload: {
  userId: string;
  userName: string;
  fileName: string;
  base64Data: string;
  contentType: string;
}): Promise<{ status: string; message: string; fileUrl?: string } | null> => {
  const GAS_URL = 'https://script.google.com/macros/s/AKfycbxtCyRhNQ6iX5DJDQd0mmNWu3b6TVxTtLCut2FRyd5O-H7VYvyDGJQEhJfzEczz1PBN4w/exec';

  try {
    console.log("正在上传图片到 Google Drive...", { ...payload, base64Data: '***' });

    await fetch(GAS_URL, {
      method: 'POST',
      mode: 'no-cors', // 💡 注意：GAS 跨域通常需要 no-cors，但会导致无法读取 response body
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: payload.userId,
        userName: payload.userName,
        fileName: payload.fileName,
        base64Data: payload.base64Data,
        contentType: payload.contentType
      })
    });

    // 由于 no-cors 模式下无法读取返回结果，我们假设只要没崩就是成功
    return { status: 'success', message: 'Upload triggered' };

  } catch (error) {
    console.error('GAS Upload Error:', error);
    throw error;
  }
};

// 🟢 删除 Drive 图片 (结合新版的 no-cors 模式)
export const deleteImageFromDrive = async (fileIdOrUrl: string) => {
  if (!API_URL || !fileIdOrUrl) return;

  try {
    console.log("正在从 Drive 删除图片:", fileIdOrUrl);

    await fetch(API_URL, {
      method: 'POST',
      // 🟢【新版特性】使用 no-cors 模式
      // 因为删除操作不需要返回值，这能避免跨域报错干扰控制台
      mode: 'no-cors',
      body: JSON.stringify({ action: 'deleteImage', fileId: fileIdOrUrl })
    });

    console.log("Drive 删除指令已发送 (Fire and Forget)");
  } catch (error) {
    console.error("Delete failed:", error);
  }
};