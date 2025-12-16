import { createClient } from '@supabase/supabase-js'

// 🔴 请去 Supabase 后台 -> Project Settings -> API 复制这两个值
// 为了方便调试，你可以先直接填在这里。正式上线 Vercel 时再改成环境变量。
const supabaseUrl = '你的_Supabase_Project_URL'
const supabaseKey = '你的_Supabase_Anon_Key'

export const supabase = createClient(supabaseUrl, supabaseKey)