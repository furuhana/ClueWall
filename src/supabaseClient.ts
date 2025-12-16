import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// 🛑 调试日志：看看环境变量到底读没读到
console.log("Supabase URL:", supabaseUrl ? "Exists" : "MISSING!");
console.log("Supabase Key:", supabaseKey ? "Exists" : "MISSING!");

if (!supabaseUrl || !supabaseKey) {
  // 如果缺失，弹窗警告（防止白屏一脸懵逼）
  alert("严重错误：无法连接数据库！\n请检查 Vercel 环境变量 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY 是否填写正确。");
  throw new Error("Supabase Url or Key is missing!");
}

export const supabase = createClient(supabaseUrl, supabaseKey)