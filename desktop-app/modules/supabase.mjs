/* ═══════════════════════════════════════════════════════════════
   Supabase module — image upload to tracker-evidence bucket
   ═══════════════════════════════════════════════════════════════ */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://lrdbybkovflytzygspdf.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxyZGJ5YmtvdmZseXR6eWdzcGRmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNTA5MzcsImV4cCI6MjA4NjcyNjkzN30.Y6vp5QUYBPTEx-7q9HOFHeBmiruFIUs7acRS0qwXExk',
);

/**
 * Upload a Buffer (JPEG) to tracker-evidence bucket.
 * Returns the public URL or null.
 */
export async function uploadImage(buffer, prefix, userId) {
  const name = `${prefix}_${userId}_${Date.now()}.jpg`;
  const blob = new Blob([buffer], { type: 'image/jpeg' });
  const { data, error } = await supabase.storage
    .from('tracker-evidence')
    .upload(name, blob, { contentType: 'image/jpeg' });
  if (error || !data) {
    console.warn('Upload error:', error);
    return null;
  }
  return supabase.storage.from('tracker-evidence').getPublicUrl(name).data.publicUrl;
}

export { supabase };
