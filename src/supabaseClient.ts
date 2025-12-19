import { createClient } from '@supabase/supabase-js';
// 🟢 修改点：对齐文件名 apiConfig 和导出的 API_CONFIG
import { API_CONFIG } from './apiConfig';

const supabaseUrl = API_CONFIG.VITE_SUPABASE_URL;
const supabaseKey = API_CONFIG.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Supabase 配置缺失，请检查 src/apiConfig.ts");
}

export const supabase = createClient(supabaseUrl, supabaseKey);