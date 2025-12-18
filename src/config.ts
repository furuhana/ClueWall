// src/config.ts

export const ENV_CONFIG = {
  // 读取 Vercel 环境变量，如果读取不到则为空字符串
  VITE_API_URL: import.meta.env.VITE_API_URL || "",
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL || "",
  VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY || ""
};

// 部署后可以在控制台看是否成功加载（不打印具体 Key，只打印状态）
if (!ENV_CONFIG.VITE_SUPABASE_URL) {
  console.warn("⚠️ 警告: 环境变量未加载。请在 Vercel Settings 中配置变量。");
}