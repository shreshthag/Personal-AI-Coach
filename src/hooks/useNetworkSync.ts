import NetInfo from "@react-native-community/netinfo";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { flushPendingWrites } from "../repositories/syncRepository";
import { useAuth } from "./useAuth";

export function useNetworkSync() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      return undefined;
    }

    return NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) {
        void flushPendingWrites().then((synced) => {
          if (synced > 0) {
            queryClient.invalidateQueries();
          }
        });
      }
    });
  }, [queryClient, user]);
}
