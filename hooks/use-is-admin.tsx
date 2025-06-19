import {
  useQuery,
} from '@tanstack/react-query';
import axios from 'axios';

export function useIsAdmin() {
  const { data: user, isLoading: userLoading, error: userError } = useQuery({
    queryKey: ['infouser'],
    queryFn: async () => {
      const response = await axios.get('/api/user');
      return response.data;
    },
    refetchInterval: 10000,
  });
  const { data: adminData, isLoading: adminLoading, error: adminError } = useQuery({
    queryKey: ['isAdmin'],
    queryFn: async () => {
      const res = await axios.get('/api/admin');
      return res.data;
    },
  });

  const isLoading = userLoading || adminLoading;
  const error = userError || adminError;

  // Si aún está cargando o hay error, devolvemos esos estados
  if (isLoading || error) {
    return { isAdmin: false, isLoading, error };
  }

  // Validamos que ambos datos existan y tengan userId
  const isAdmin = user && adminData && user.userId === adminData.userId;

  return { isAdmin, isLoading: false, error: null };
}
