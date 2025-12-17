import { Note, Connection } from './types';

const API_URL = import.meta.env.VITE_API_URL;

if (!API_URL) {
  console.error("❌ 严重错误: 未找到 VITE_API_URL 环境变量！");
}

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

export const saveBoardData = async (notes: Note[], connections: Connection[]) => {
  if (!API_URL) return;
  // Google Sheets 保存逻辑 (目前主要走 Supabase，这个作为备用或双备份)
  fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify({ action: 'saveBoard', notes, connections })
  }).catch(e => console.error("GAS Save Error:", e));
};

// 🟢 增强版图片上传
export const uploadImage = async (file: File): Promise<string | null> => {
  if (!API_URL) {
      alert("上传失败：未配置 Google API 链接");
      return null;
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    
    reader.onload = async () => {
      const base64 = reader.result as string;
      try {
        console.log("正在上传图片到 Google Drive..."); // 调试日志
        
        const response = await fetch(API_URL, {
          method: 'POST',
          // ⚠️ 关键：不要加 headers Content-Type，让浏览器自动处理 Simple Request 避免 CORS
          body: JSON.stringify({
            action: 'uploadImage',
            base64,
            filename: file.name
          })
        });
        
        const text = await response.text(); // 先按文本读取，防止 JSON 解析挂了没报错
        try {
            const data = JSON.parse(text);
            if (data && data.fileId) {
                console.log("上传成功! URL:", data.fileId);
                resolve(data.fileId);
            } else {
                console.error("GAS 返回错误结构:", data);
                resolve(null);
            }
        } catch (e) {
            console.error("GAS 返回了非 JSON 数据 (可能是报错页面):", text);
            resolve(null);
        }

      } catch (e) {
        console.error("请求发送失败 (可能是 CORS):", e);
        resolve(null);
      }
    };
  });
};