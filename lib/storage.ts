// KPI 截圖上傳（client 端壓縮 + Supabase Storage）
// [你的決定:上傳截圖自動壓縮,預設長邊 1600px/品質 0.8]
// [已查證:上傳 API supabase.storage.from(bucket).upload,
//  取 URL getPublicUrl,supabase.com/docs/reference/javascript/storage-from-upload]
import { createClient } from '@/utils/supabase/client'

const BUCKET = 'kpi-screenshots'
const MAX_EDGE = 1600 // 長邊上限
const QUALITY = 0.8 // JPEG 品質

// canvas 壓縮:等比縮到長邊 <= MAX_EDGE,輸出 JPEG blob
async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  let { width, height } = bitmap
  if (width > MAX_EDGE || height > MAX_EDGE) {
    if (width >= height) {
      height = Math.round((height * MAX_EDGE) / width)
      width = MAX_EDGE
    } else {
      width = Math.round((width * MAX_EDGE) / height)
      height = MAX_EDGE
    }
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('無法建立 canvas context')
  ctx.drawImage(bitmap, 0, 0, width, height)
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('壓縮失敗'))),
      'image/jpeg',
      QUALITY
    )
  })
}

// 壓縮並上傳,回傳公開 URL
export async function uploadKpiScreenshot(
  kpiId: string,
  file: File
): Promise<string> {
  const supabase = createClient()
  const compressed = await compressImage(file)
  const path = `${kpiId}/${Date.now()}.jpg`
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, compressed, {
      contentType: 'image/jpeg',
      upsert: true,
    })
  if (error) throw error
  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(path)
  // 把 URL 寫回 kpis
  const { error: updErr } = await supabase
    .from('kpis')
    .update({ screenshot_url: publicUrl })
    .eq('id', kpiId)
  if (updErr) throw updErr
  return publicUrl
}
