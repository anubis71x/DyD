import {create} from 'zustand';

interface NarratorState {
    narrator: string;
    setNarrator: (narrator: string) => void;
    clearNarrator: () => void;
    editNarrator: (narrator: string) => void;
}

const useStore = create<NarratorState>((set) => ({
    narrator: '',
    setNarrator: (narrator: string) => set({ narrator }),
    clearNarrator: () => set({ narrator: '' }),
    editNarrator: (narrator: string) => set({ narrator }),
}));

export default useStore;