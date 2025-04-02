import {create} from 'zustand';

interface StoreState {
    callActive: boolean;
    setCallActive: (active: boolean) => void;
}

const useStoreCall = create<StoreState>((set) => ({
    callActive: false,
    setCallActive: (active) => set({ callActive: active }),
}));

export default useStoreCall;