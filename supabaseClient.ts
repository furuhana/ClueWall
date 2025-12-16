import { createClient } from '@supabase/supabase-js'

// 🔴 请去 Supabase 后台 -> Project Settings -> API 复制这两个值
// 为了方便调试，你可以先直接填在这里。正式上线 Vercel 时再改成环境变量。
const supabaseUrl = 'https://nxkamhepawefvcvtmfrl.supabase.co'
const supabaseKey = 'sb_publishable_3wXbMevhtHu3j4NOIsqxEA_Wb0q1Kmm'

export const supabase = createClient(supabaseUrl, supabaseKey)