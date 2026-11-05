import { useQuery } from "@tanstack/react-query";
import axios from "axios";

/** Whether the signed-in user is an admin, as decided by the server. */
export function useIsAdmin() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["isAdmin"],
    queryFn: async () => (await axios.get<{ isAdmin: boolean }>("/api/admin?me=1")).data,
  });
  return { isAdmin: !!data?.isAdmin, isLoading, error: error ?? null };
}
