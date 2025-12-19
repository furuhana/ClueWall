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

// 🟢 增强版图片上传 (保留原版强大的错误处理逻辑)
export const uploadImage = async (file: File, userId?: string, userName?: string): Promise<string | null> => {
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
        console.log("正在上传图片到 Google Drive...", { userId, userName });

        const response = await fetch(API_URL, {
          method: 'POST',
          // ⚠️ 关键：原版逻辑，不要加 headers Content-Type，让浏览器自动处理 Simple Request
          body: JSON.stringify({
            action: 'uploadImage',
            base64,
            filename: file.name,
            userId,      // 🟢 新增身份标识
            userName     // 🟢 新增身份标识
          })
        });

        // 🛡️ 防御性编程：GAS 有时会返回 HTML 错误页，直接 .json() 会崩
        const text = await response.text();
        try {
          const data = JSON.parse(text);

          if (data && data.status === 'success') {
            // 优先使用 fileUrl 显示
            const resultUrl = data.fileUrl || data.fileId;
            console.log("上传成功! URL:", resultUrl);
            resolve(resultUrl);
          } else {
            console.error("GAS 返回错误:", data);
            resolve(null);
          }
        } catch (e) {
          console.error("GAS 返回了非 JSON 数据 (可能是 HTML 报错):", text);
          resolve(null);
        }

      } catch (e) {
        console.error("请求发送失败 (可能是 CORS):", e);
        resolve(null);
      }
    };
  });
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