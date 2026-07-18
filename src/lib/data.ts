import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "./auth";

export interface Library {
  id: string;
  name: string;
  zone_area: string | null;
  city: string | null;
  org_id: string;
  show_public_availability: boolean;
  is_active: boolean;
}

export function useLibraries() {
  const { data: session } = useSession();
  const staffLibs = session?.staffLibraryIds;
  return useQuery({
    queryKey: ["libraries", session?.orgId, staffLibs],
    enabled: !!session?.orgId,
    queryFn: async () => {
      let q = supabase
        .from("libraries")
        .select("*")
        .eq("org_id", session!.orgId!)
        .order("created_at", { ascending: true });
      if (session?.isStaff) {
        if (!staffLibs || staffLibs.length === 0) return [] as Library[];
        q = q.in("id", staffLibs);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data as Library[];
    },
  });
}

export function useMasterExams() {
  return useQuery({
    queryKey: ["master_exams"],
    queryFn: async () => {
      const { data, error } = await supabase.from("master_exams").select("id, name, category").eq("is_active", true).order("name");
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60_000,
  });
}
