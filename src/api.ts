import { Note, Connection } from './types';

const API_URL = import.meta.env.VITE_API_URL;

if (!API_URL) {
  console.error("❌ 严重错误: 未找到 VITE_API_URL 环境变量！");
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

// 🟢 保存数据 (备用/双备份)
export const saveBoardData = async (notes: Note[], connections: Connection[]) => {
  if (!API_URL) return;
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
        console.log("正在上传图片到 Google Drive..."); 
        
        const response = await fetch(API_URL, {
          method: 'POST',
          // ⚠️ 关键：不要加 headers Content-Type，让浏览器自动处理 Simple Request
          body: JSON.stringify({
            action: 'uploadImage',
            base64,
            filename: file.name
          })
        });
        
        const text = await response.text(); 
        try {
            const data = JSON.parse(text);
            // 🟢 适配新的 GAS 返回结构：优先使用 fileUrl (为了显示)，如果没有则用 fileId
            if (data && data.status === 'success') {
                const resultUrl = data.fileUrl || data.fileId;
                console.log("上传成功! URL:", resultUrl);
                resolve(resultUrl);
            } else {
                console.error("GAS 返回错误:", data);
                resolve(null);
            }
        } catch (e) {
            console.error("GAS 返回了非 JSON 数据:", text);
            resolve(null);
        }

      } catch (e) {
        console.error("请求发送失败 (可能是 CORS):", e);
        resolve(null);
      }
    };
  });
};

// 🟢 [新增] 删除图片
export const deleteImageFromDrive = async (fileIdOrUrl: string) => {
  if (!API_URL) return;
  
  try {
    console.log("正在从 Drive 删除图片:", fileIdOrUrl);
    
    // 发送删除请求，不需要等待结果 (fire and forget)，或者你可以 await 它
    await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify({
        action: 'deleteImage',
        fileId: fileIdOrUrl // 后端会自动识别这是 ID 还是 URL
      })
    });
    
    console.log("Drive 删除指令已发送");
  } catch (error) {
    console.error("删除 Drive 图片失败:", error);
  }
};