import { supabase as supabaseClient } from '../supabase';

export const supabase = supabaseClient;

/**
 * SUPABASE SQL SCHEMA (Run this in Supabase SQL Editor):
 * 
 * -- 1. Users Table
 * create table users (
 *   uid text primary key,
 *   email text,
 *   username text,
 *   password text,
 *   name text not null,
 *   role text not null,
 *   company_id text,
 *   company_name text,
 *   created_at timestamp with time zone default now()
 * );
 * 
 * -- 2. Companies Table
 * create table companies (
 *   id text primary key,
 *   name text not null,
 *   created_at timestamp with time zone default now()
 * );
 * 
 * -- 3. LOPs Table
 * create table lops (
 *   id text primary key,
 *   name text not null,
 *   type text not null,
 *   company_id text references companies(id) on delete set null,
 *   company_name text,
 *   status text not null,
 *   created_at timestamp with time zone
 * );
 * 
 * -- 4. BOQ Items Table
 * create table boq_items (
 *   lop_id text references lops(id) on delete cascade,
 *   item_index int,
 *   designator text,
 *   description text,
 *   uom text,
 *   qty numeric,
 *   primary key (lop_id, item_index)
 * );
 * 
 * -- 5. Submissions Table
 * create table submissions (
 *   id text primary key,
 *   lop_id text references lops(id) on delete cascade,
 *   boq_index int,
 *   status text not null,
 *   reject_reason text,
 *   files jsonb,
 *   updated_at timestamp with time zone
 * );
 * 
 * -- 6. Mandatory Uploads Table
 * create table mandatory_uploads (
 *   id text primary key,
 *   lop_id text references lops(id) on delete cascade,
 *   type text not null,
 *   files jsonb,
 *   status text default 'pending',
 *   reject_reason text,
 *   updated_at timestamp with time zone
 * );
 * 
 * -- 7. Storage Bucket (Run this to create the bucket for uploads)
 * insert into storage.buckets (id, name, public) values ('evidence', 'evidence', true);
 * create policy "Public Access" on storage.objects for select using ( bucket_id = 'evidence' );
 * create policy "Public Insert" on storage.objects for insert with check ( bucket_id = 'evidence' );
 * create policy "Public Update" on storage.objects for update using ( bucket_id = 'evidence' );
 * create policy "Public Delete" on storage.objects for delete using ( bucket_id = 'evidence' );
 */

export async function syncUserToSupabase(profile: any) {
  if (!supabase) {
    console.warn('Supabase client not initialized. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
    return;
  }
  
  console.log('Syncing user to Supabase:', profile.name);
  const { error } = await supabase
    .from('users')
    .upsert({
      uid: profile.uid,
      email: profile.email || null,
      username: profile.username || null,
      password: profile.password || null,
      name: profile.name,
      role: profile.role,
      company_id: profile.companyId || null,
      company_name: profile.companyName || null
    }, { onConflict: 'uid' });

  if (error) {
    console.error('Supabase Sync Error (User):', error.message, error.details, error.hint);
  } else {
    console.log('Supabase Sync Success (User)');
  }
}

export async function syncCompanyToSupabase(id: string, name: string) {
  if (!supabase) return;
  
  const { error } = await supabase
    .from('companies')
    .upsert({
      id: id,
      name: name,
      created_at: new Date().toISOString()
    }, { onConflict: 'id' });

  if (error) console.error('Supabase Sync Error (Company):', error);
}

export async function syncLopToSupabase(id: string, lop: any) {
  if (!supabase) return;
  
  const { error } = await supabase
    .from('lops')
    .upsert({
      id: id,
      name: lop.name,
      type: lop.type,
      company_id: lop.companyId,
      company_name: lop.companyName,
      status: lop.status,
      created_at: lop.createdAt
    });

  if (error) {
    console.error('Supabase Sync Error (LOP):', error);
    return;
  }

  // Sync BOQ Items
  if (lop.boq && Array.isArray(lop.boq)) {
    const boqItems = lop.boq.map((item: any, index: number) => ({
      lop_id: id,
      item_index: index,
      designator: item.designator,
      description: item.description,
      uom: item.uom,
      qty: parseFloat(item.qty) || 0
    }));

    const { error: boqError } = await supabase
      .from('boq_items')
      .upsert(boqItems, { onConflict: 'lop_id,item_index' });

    if (boqError) console.error('Supabase Sync Error (BOQ):', boqError);
  }
}

export async function deleteCompanyFromSupabase(id: string) {
  if (!supabase) return;
  const { error } = await supabase.from('companies').delete().eq('id', id);
  if (error) console.error('Supabase Delete Error (Company):', error);
}

export async function deleteLopFromSupabase(id: string) {
  if (!supabase) return;
  const { error } = await supabase.from('lops').delete().eq('id', id);
  if (error) console.error('Supabase Delete Error (LOP):', error);
}

export async function deleteUserFromSupabase(uid: string) {
  if (!supabase) return;
  const { error } = await supabase.from('users').delete().eq('uid', uid);
  if (error) console.error('Supabase Delete Error (User):', error);
}

export async function syncSubmissionToSupabase(id: string, sub: any) {
  if (!supabase) return;
  
  const { error } = await supabase
    .from('submissions')
    .upsert({
      id: id,
      lop_id: sub.lopId,
      boq_index: sub.boqIndex,
      status: sub.status,
      reject_reason: sub.rejectReason || null,
      files: sub.files,
      updated_at: sub.updatedAt || new Date().toISOString()
    });

  if (error) console.error('Supabase Sync Error (Submission):', error);
}

export async function syncMandatoryUploadToSupabase(id: string, mand: any) {
  if (!supabase) return;
  
  const { error } = await supabase
    .from('mandatory_uploads')
    .upsert({
      id: id,
      lop_id: mand.lopId,
      type: mand.type,
      files: mand.files,
      status: mand.status || 'pending',
      reject_reason: mand.rejectReason || null,
      updated_at: mand.updatedAt || new Date().toISOString()
    });

  if (error) console.error('Supabase Sync Error (Mandatory):', error);
}

export async function uploadFileToSupabase(file: File, path: string) {
  if (!supabase) throw new Error('Supabase not initialized');
  
  const fileExt = file.name.split('.').pop();
  const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
  const filePath = `${path}/${fileName}`;

  const { data, error } = await supabase.storage
    .from('evidence')
    .upload(filePath, file);

  if (error) throw error;

  const { data: { publicUrl } } = supabase.storage
    .from('evidence')
    .getPublicUrl(filePath);

  return { url: publicUrl, name: file.name, size: file.size, type: file.type };
}

export async function deleteFilesFromSupabase(urls: string[]) {
  if (!supabase || urls.length === 0) return;
  
  // Extract file paths from public URLs
  const paths = urls.map(url => {
    const parts = url.split('/evidence/');
    return parts.length > 1 ? parts[1] : null;
  }).filter(Boolean) as string[];

  if (paths.length === 0) return;

  const { error } = await supabase.storage.from('evidence').remove(paths);
  if (error) {
    console.error('Error deleting files from Supabase:', error);
  }
}

export async function getStorageUsageFromSupabase() {
  if (!supabase) return 0;
  
  let totalBytes = 0;

  try {
    // Fetch all submissions
    const { data: subs, error: err1 } = await supabase.from('submissions').select('files');
    if (!err1 && subs) {
      subs.forEach(sub => {
        if (Array.isArray(sub.files)) {
          sub.files.forEach(f => {
            if (f.size) totalBytes += f.size;
          });
        }
      });
    }

    // Fetch all mandatory uploads
    const { data: mands, error: err2 } = await supabase.from('mandatory_uploads').select('files');
    if (!err2 && mands) {
      mands.forEach(mand => {
        if (Array.isArray(mand.files)) {
          mand.files.forEach(f => {
            if (f.size) totalBytes += f.size;
          });
        }
      });
    }
  } catch (err) {
    console.error('Error calculating storage usage:', err);
  }

  return totalBytes;
}

export async function getLopsFromSupabase(companyId?: string) {
  if (!supabase) return [];
  
  let query = supabase
    .from('lops')
    .select('*')
    .order('created_at', { ascending: false });

  if (companyId) {
    query = query.eq('company_id', companyId);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Error fetching LOPs from Supabase:', error);
    return [];
  }
  return data;
}

export async function getSubmissionsFromSupabase(lopId: string) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('submissions')
    .select('*')
    .eq('lop_id', lopId);
  
  if (error) {
    console.error('Error fetching submissions from Supabase:', error);
    return [];
  }
  return data;
}

export async function getMandatoryUploadsFromSupabase(lopId: string) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('mandatory_uploads')
    .select('*')
    .eq('lop_id', lopId);
  
  if (error) {
    console.error('Error fetching mandatory uploads from Supabase:', error);
    return [];
  }
  return data;
}
