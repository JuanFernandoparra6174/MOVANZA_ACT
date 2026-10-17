
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const URL_SUPABASE = 'https://pjyusanlrvoptqzpdxod.supabase.co';
const CLAVE_PUBLICA = 'sb_publishable_vgPi5-E2-PL7Owf7RkpY1w_x9O9OpG2';

export const supabase = createClient(
  URL_SUPABASE,
  CLAVE_PUBLICA
);
