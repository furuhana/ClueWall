import { createClient } from '@supabase/supabase-js'

// 🟢 改成从环境变量读取
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ 缺少 Supabase 环境变量！请检查 .env 文件或 Vercel 设置。")
}

export const supabase = createClient(supabaseUrl, supabaseKey)