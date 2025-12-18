/**
 * API 与插件配置文件
 * 仅从系统环境变量读取，防止源码泄漏隐私。
 */
export const API_CONFIG = {
  // 🟢 只读取环境变量，不填默认值（字符串留空）
  VITE_API_URL: import.meta.env?.VITE_API_URL || "",

  // Supabase 配置
  VITE_SUPABASE_URL: import.meta.env?.VITE_SUPABASE_URL || "",
  VITE_SUPABASE_ANON_KEY: import.meta.env?.VITE_SUPABASE_ANON_KEY || "",
};

// 部署后的自检：如果变量没读取到，在控制台给个提醒（不打印具体值）
if (!API_CONFIG.VITE_SUPABASE_URL) {
  console.warn("⚠️ 环境监测：未检测到 VITE_SUPABASE_URL，请检查 Vercel 环境变量配置。");
}