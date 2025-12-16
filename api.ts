import { Note, Connection } from './types';

// 🟢 关键修改：从 Vercel/Vite 环境变量中读取 URL
// 如果本地开发，请在根目录新建 .env.local 文件并写入: VITE_API_URL=你的GAS链接
const API_URL = import.meta.env.VITE_API_URL;

// 调试日志：如果没读到 URL，会在控制台报错提醒
if (!API_URL) {
  console.error("❌ 严重错误: 未找到 VITE_API_URL 环境变量！\n请在 Vercel 的 Environment Variables 中配置，键名为 'VITE_API_URL'，值为你的 Google Apps Script 部署链接。");
}

export const fetchBoardData = async () => {
  if (!API_URL) return null; // 如果没有 URL，直接返回 null，防止崩溃

  try {
    // GAS 部署 Web App 后，默认支持跟随重定向，通常不需要额外配置
    const response = await fetch(`${API_URL}?action=getAll`);
    const data = await response.json();
    return data; 
  } catch (error) {
    console.error("Failed to fetch board data", error);
    return null;
  }
};

export const saveBoardData = async (notes: Note[], connections: Connection[]) => {
  if (!API_URL) return;

  try {
    // 注意：fetch POST 到 Google Apps Script 时，
    // 千万不要手动设置 'Content-Type': 'application/json' Headers。
    // 因为这会触发浏览器发送 OPTIONS 预检请求，而 GAS 不支持 OPTIONS，会导致 CORS 错误。
    // 保持默认 Simple Request (text/plain) 即可，GAS 后端能解析。
    await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify({
        action: 'saveBoard',
        notes,
        connections
      })
    });
  } catch (error) {
    console.error("Failed to save board data", error);
  }
};

export const uploadImage = async (file: File): Promise<string | null> => {
  if (!API_URL) return null;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    
    reader.onload = async () => {
      const base64 = reader.result as string;
      try {
        const response = await fetch(API_URL, {
          method: 'POST',
          body: JSON.stringify({
            action: 'uploadImage',
            base64,
            filename: file.name
          })
        });
        const data = await response.json();
        
        if (data && data.fileId) {
            resolve(data.fileId); // 这里返回的是云端 URL
        } else {
            console.error("Upload response missing fileId", data);
            resolve(null);
        }
      } catch (e) {
        console.error("Upload request failed", e);
        resolve(null);
      }
    };
    
    reader.onerror = (error) => {
        console.error("File reader error", error);
        resolve(null);
    };
  });
};